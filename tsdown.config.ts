/**
 * Standalone build for this dual-face DSH plugin package:
 *
 * 1. **Node half** — plain ESM library entries consumed by the host Loader
 *    (`lib/index.js`, `lib/tools.js`, `lib/types.js`, `lib/remote.js`).
 * 2. **Browser half** — one closure-factory bundle at `lib/client.js` that
 *    registers itself through `window.__ModuleLoader__.load({ id, factory })`,
 *    the contract the DSH web shell's client module system expects. Platform
 *    modules (react, the UI atom packages, cordis) stay external and resolve
 *    through the shell's frozen module table; everything else inlines. CSS
 *    Modules are compiled by lightningcss and self-inject a
 *    `<style data-plugin>` tag at factory execution.
 *
 * This mirrors the monorepo's `packages/client/tsdown.client.ts` preset
 * (deepseek-ai/deepseek-harness) with the workspace machinery removed; keep
 * PLATFORM_MODULES in sync with `packages/client/web/src/platform.ts`
 * upstream when the shell adds shared modules.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** The package name doubles as the client-plugin id stamped into the bundle handoff. */
const PLUGIN_ID = 'dsh-credential-manager'

/**
 * Browser platform modules shared by the shell's frozen module table.
 * Mirror of `packages/client/web/src/platform.ts` (PLATFORM_MODULES).
 *
 * 2026-09-19 (dsh 0.1.5-rc.2): @deepseek-ai/dsh-client-runtime no longer
 * exists; its store engine moved to @deepseek-ai/dsh-client-store and its
 * 'slots' service moved to @deepseek-ai/dsh-client-ui-renderer. The table now
 * also carries @deepseek-ai/dsh-client-ui-dockkit. Anything the plugin imports
 * that is NOT listed must inline (see noExternal) — a require() the frozen
 * table cannot answer is a guaranteed runtime throw.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

// Entries consume the tsc output in lib/types (decorators already lowered by
// tsc), exactly like the monorepo's workspace build — bundling raw src would
// leave TC39 decorator syntax in the emitted ESM, which Node cannot parse.
const lib: UserConfig = {
  name: PLUGIN_ID,
  entry: {
    index: 'lib/types/index.js',
    tools: 'lib/types/tools.js',
    types: 'lib/types/types.js',
    spec: 'lib/types/spec.js',
    remote: 'lib/types/client/remote.js',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

const client: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  // tsdown auto-externalizes package dependencies; anything NOT in the loader
  // module table must inline instead, because a require() the frozen table
  // cannot answer is a guaranteed runtime throw.
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [{
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
      // One <style data-plugin> per module file; idempotent under re-evaluation.
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(fileId)}`)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

/**
 * Resolve an emitted JS asset import against its source-tree counterpart:
 * tsc does not copy `.module.css` assets into lib/types, so a CSS import in
 * the compiled client half re-anchors onto src/ (same helper as the monorepo
 * preset's `sourceAssetPath`).
 */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

export default [lib, client]

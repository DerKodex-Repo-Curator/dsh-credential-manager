/**
 * Credentials settings plugin, browser half: mounts this package's own
 * Typert Remote contribution (no core wiring required — the api-gateway's
 * `ctx.remote.$mount` is a public seam), registers the Credentials page in
 * the settings shell, and keeps it fresh on pushed
 * `credential-manager/updated` invalidations and connection resets. The page
 * is the user's entry point for the empty placeholders the model's
 * credential_create tool opens.
 *
 * Deployment note: the stock upstream api-remotes allowlist does not forward
 * `credential-manager/updated`, so on an unpatched harness the pushed
 * invalidation simply never arrives; the page still converges through the
 * authoritative mutation replies and the connection-reset refetch.
 * @module dsh-credential-manager/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { CredentialsSection } from './CredentialsSection.tsx'
import type { CredentialsSectionInjected } from './CredentialsSection.tsx'
import { CredentialsSettingsStore } from './store.ts'
import type { CredentialManagerRemote } from './store.ts'
import { en, zh } from './locales.ts'
import credentialManagerRemote from './remote.ts'

export type { CredentialsSectionInjected, CredentialsSectionProps } from './CredentialsSection.tsx'
export type {
  CredentialActionResult,
  CredentialManagerRemote,
  CredentialsSettingsState,
  CredentialsSettingsStatus,
} from './store.ts'
export { CredentialsSettingsStore } from './store.ts'
export type { CredentialsKey } from './locales.ts'

// Local Context merges standing in for the api-gateway / client-runtime
// packages (both unpublished on npm): the runtime-provided services are
// identical at runtime, and the shapes below are the exact public faces this
// plugin consumes. The merges are structurally identical to the upstream
// declarations, so a compile graph containing both stays legal.
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Typert Remote client capability, provided by @deepseek-ai/dsh-api-gateway's client half. */
    remote: TypertClientRemote
  }
  interface Events {
    /** The connection carrier reset; open surfaces refetch. */
    'connection/reset'(): void
  }
}

/**
 * Minimal structural face of the client-runtime's SlotRegistry this plugin
 * consumes. Read through `ctx.get` (no Context merge): the runtime's own
 * declaration stays the single authority, and this package compiles without
 * `@deepseek-ai/dsh-client-runtime` (unpublished on npm).
 */
interface SettingsSlotRegistry {
  /** Run an effect for each lifetime of the named slot declaration. */
  inject(key: string, callback: () => (() => void) | Iterable<() => void, void, void>): () => void
  /** Register one entry into a declared slot; returns the entry disposer. */
  register(options: Record<string, unknown>, component: unknown): () => void
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection {
    /**
     * Forwarded-host-event seat for this plugin's committed-change event.
     * NOTE: the stock upstream api-remotes allowlist does not forward it, so
     * the subscription in apply() stays silent on an unpatched harness.
     */
    'credential-manager/updated': true
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-credential-manager'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.credentials' as const

/**
 * Refetch the page snapshot only after its first load: an unopened
 * Credentials page must not fetch on background invalidations.
 * @param controller - the page store.
 */
export function refreshIfLoaded(controller: CredentialsSettingsStore): void {
  if (controller.getSnapshot().status === 'idle') return
  void controller.load()
}

/**
 * Required services: the slot registry, the copy, and the api-gateway's
 * client Remote capability (provided by `@deepseek-ai/dsh-api-gateway`,
 * declared in this package's `dsh.client.inject` manifest).
 */
export const inject = ['slots', 'locale', 'remote']

/**
 * Mount the credentialManager Remote namespace, register the Credentials
 * section once the `settings.section` declaration is on the ledger, and wire
 * the store to pushed invalidations. Everything attaches to the plugin fiber
 * through ctx.effect / the mounted contribution's disposer, so unloading the
 * plugin retracts the page and the Remote namespace cleanly.
 * @param ctx - client root context.
 */
export async function apply(ctx: Context): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-credential-manager: copy dictionaries')

  // Self-mount the Remote contribution: no api-remotes assembly edit needed.
  const disposeRemote = await ctx.remote.$mount(credentialManagerRemote)
  ctx.effect(() => disposeRemote, 'dsh-credential-manager: remote namespace')

  const manager = ctx.get('remote.credentialManager')
  if (manager === undefined) {
    throw new Error('dsh-credential-manager: remote.credentialManager did not materialize after $mount')
  }

  const controller = new CredentialsSettingsStore(manager as CredentialManagerRemote)
  const useSnapshot = bindSnapshotSelector(controller)
  // Registration-time text (the nav label thunk) and the inject face share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as CredentialsSectionInjected['t']
  const injected = (): CredentialsSectionInjected => ({ controller, useSnapshot, t })

  // Pushed invalidations converge every open surface without polling. On a
  // stock upstream host the event is not forwarded, so this subscription
  // stays silent there — the connection-reset refetch below still applies.
  ctx.effect(() => {
    const refresh = (): void => { refreshIfLoaded(controller) }
    const disposers = [
      ctx.remote.$on('credential-manager/updated', refresh),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'dsh-credential-manager: pushed invalidations')

  const slots = ctx.get('slots') as SettingsSlotRegistry | undefined
  if (slots === undefined) {
    throw new Error('dsh-credential-manager: the slots service is unavailable (non-web surface?)')
  }
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'credentials',
    order: 20,
    label: () => t('nav'),
    inject: injected,
  }, CredentialsSection))
}

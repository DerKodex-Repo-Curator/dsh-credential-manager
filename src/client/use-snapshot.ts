/**
 * uSES bridge: turns any bare observable snapshot source into a typed
 * selector hook. Client-side-rendered only, so no server snapshot is wired.
 *
 * This is a vendored copy of the upstream `bindSnapshotSelector` from
 * `@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts` (verified against
 * dsh 0.1.1-rc.2, checkout b150a551b8).
 *
 * Why vendored instead of imported:
 * - The old `@deepseek-ai/dsh-client-web-react` package no longer exists in
 *   dsh 0.1.x (removed from the shell's frozen module table).
 * - The replacement package `@deepseek-ai/dsh-client-ui-renderer` does NOT
 *   re-export `bindSnapshotSelector` from any public entry (`./client` only
 *   exports the mount face / types); the function lives in an internal
 *   source file (`src/client/bind.ts`) reachable only through the unstable
 *   `./src/*` export.
 * - ui-renderer is also NOT part of the shell's frozen module table, so a
 *   browser bundle must inline the function anyway (it cannot be `require`d
 *   by the plugin bundle).
 *
 * Keeping a local copy makes the plugin independent of that package's
 * internal layout: if upstream ever re-exports a public binding, this file is
 * the single place to switch back. The implementation is the stable, tiny uSES
 * contract that has not changed across dsh versions.
 *
 * @module dsh-credential-manager/client/use-snapshot
 */
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector.js'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Bind a bare observable source to a typed uSES selector hook.
 * subscribe/getSnapshot are captured once per source into stable closures
 * (also re-binds `this` for method-based sources), so components never
 * resubscribe across renders. Equality defaults to Object.is.
 * @param w - snapshot source (engine store, Session object, store instance).
 * @returns the selector hook.
 */
export function bindSnapshotSelector<T>(w: HostObservable<T>): SnapshotSelectorHook<T> {
  const subscribe = (fn: () => void) => w.subscribe(fn)
  const getSnapshot = () => w.getSnapshot()
  return function useSelector<S>(sel: (s: T) => S, eq?: (a: S, b: S) => boolean): S {
    return useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, sel, eq)
  }
}

/**
 * Page store for the Credentials settings section: one snapshot over the
 * credentialManager Remote. One credential is one flat record with one secret
 * value; reads are structurally value-free and the only request carrying a
 * secret value is `setSecret`. Pushed `credential-manager/updated`
 * invalidations and connection resets refetch only after the first load (see
 * the plugin's apply).
 * @module dsh-credential-manager/client/store
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CredentialManagerCreateResult,
  CredentialManagerDeleteResult,
  CredentialManagerGetResult,
  CredentialManagerListResult,
  CredentialManagerSetSecretResult,
  CredentialManagerUnsetSecretResult,
  CredentialManagerUpdateResult,
  CredentialView,
} from '../types.ts'

/**
 * The Remote calls this page needs. The generated face wraps every business
 * result in {@link RemoteResult}: a carrier failure arrives as the `ok:
 * false` branch rather than a rejection, so the store reads one envelope and
 * never wraps a call to recover a transport error.
 */
export interface CredentialManagerRemote {
  list: (request: Record<string, never>) => Promise<RemoteResult<CredentialManagerListResult>>
  get: (request: { id: string }) => Promise<RemoteResult<CredentialManagerGetResult>>
  create: (request: { name: string; id?: string; userNotes?: string; expireDate?: string })
    => Promise<RemoteResult<CredentialManagerCreateResult>>
  update: (request: {
    id: string
    name?: string
    userNotes?: string | null
    llmNotes?: string | null
    expireDate?: string | null
  }) => Promise<RemoteResult<CredentialManagerUpdateResult>>
  setSecret: (request: { id: string; value: string })
    => Promise<RemoteResult<CredentialManagerSetSecretResult>>
  unsetSecret: (request: { id: string })
    => Promise<RemoteResult<CredentialManagerUnsetSecretResult>>
  delete: (request: { id: string }) => Promise<RemoteResult<CredentialManagerDeleteResult>>
}

/** Load state of the page's one list read. */
export type CredentialsSettingsStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Immutable page snapshot. */
export interface CredentialsSettingsState {
  readonly status: CredentialsSettingsStatus
  /** Current value-free credential views, in first-creation order. */
  readonly credentials: readonly CredentialView[]
  /** Reason the last load failed, cleared by the next successful load. */
  readonly error: string | null
  /** Business failure code of the last rejected mutation, cleared on success. */
  readonly actionError: string | null
}

const INITIAL_STATE: CredentialsSettingsState = Object.freeze({
  status: 'idle',
  credentials: Object.freeze([]),
  error: null,
  actionError: null,
})

/** Settled mutation shape rendered inline by the section. */
export type CredentialActionResult = { ok: true } | { ok: false; code: string }

const OK: CredentialActionResult = Object.freeze({ ok: true })

/**
 * Credentials page store. The Host owns the record; every mutation reply
 * carries the authoritative view, so a successful mutation splices it into
 * the snapshot without a refetch.
 */
export class CredentialsSettingsStore implements HostObservable<CredentialsSettingsState> {
  private state = INITIAL_STATE
  private readonly listeners = new Set<() => void>()
  private loadPromise: Promise<void> | null = null

  /**
   * @param remote - the credentialManager Remote namespace.
   */
  constructor(private readonly remote: CredentialManagerRemote) {}

  getSnapshot = (): CredentialsSettingsState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Publish one freshly built snapshot. */
  private publish(next: CredentialsSettingsState): void {
    this.state = Object.freeze(next)
    for (const listener of [...this.listeners]) listener()
  }

  /** Load or reload the full list; concurrent callers share one flight. */
  async load(): Promise<void> {
    this.loadPromise ??= (async () => {
      this.publish({ ...this.state, status: 'loading', error: null })
      const carried = await this.remote.list({})
      if (!carried.ok) {
        this.publish({ ...this.state, status: 'error', error: carried.error.code })
      } else {
        // list is success-only: the carrier unwraps straight to the payload.
        this.publish({
          ...this.state,
          status: 'ready',
          credentials: Object.freeze([...carried.value.value.credentials]),
          error: null,
        })
      }
      this.loadPromise = null
    })()
    return this.loadPromise
  }

  /** Splice one authoritative view into the snapshot. */
  private absorb(credential: CredentialView): void {
    const credentials = [...this.state.credentials]
    const index = credentials.findIndex(entry => entry.id === credential.id)
    if (index === -1) credentials.push(credential)
    else credentials[index] = credential
    this.publish({ ...this.state, credentials: Object.freeze(credentials), actionError: null })
  }

  /** Drop one id from the snapshot after a successful deletion. */
  private evict(id: string): void {
    this.publish({
      ...this.state,
      credentials: Object.freeze(this.state.credentials.filter(entry => entry.id !== id)),
      actionError: null,
    })
  }

  /** Publish one mutation failure code. */
  private fail(code: string): CredentialActionResult {
    this.publish({ ...this.state, actionError: code })
    return { ok: false, code }
  }

  /** Unwrap the carrier envelope of one view-bearing mutation. */
  private absorbResult(
    carried: RemoteResult<
      | CredentialManagerCreateResult
      | CredentialManagerUpdateResult
      | CredentialManagerSetSecretResult
      | CredentialManagerUnsetSecretResult
    >,
  ): CredentialActionResult {
    if (!carried.ok) return this.fail(carried.error.code)
    const result = carried.value
    if (!result.ok) return this.fail(result.error.code)
    this.absorb(result.value)
    return OK
  }

  /**
   * Create one credential, then store the secret value when the form carried
   * one (two wire calls; a setSecret failure leaves the placeholder visible
   * with its error inline).
   */
  async create(request: {
    name: string
    id?: string
    userNotes?: string
    expireDate?: string
    secret?: string
  }): Promise<CredentialActionResult> {
    const { secret, ...createRequest } = request
    const carried = await this.remote.create(createRequest)
    if (!carried.ok) return this.fail(carried.error.code)
    if (!carried.value.ok) return this.fail(carried.value.error.code)
    this.absorb(carried.value.value)
    if (secret === undefined || secret.length === 0) return OK
    return this.setSecret(String(carried.value.value.id), secret)
  }

  /** Rename or update notes/expiry; `null` clears the targeted field. */
  async update(request: {
    id: string
    name?: string
    userNotes?: string | null
    llmNotes?: string | null
    expireDate?: string | null
  }): Promise<CredentialActionResult> {
    return this.absorbResult(await this.remote.update(request))
  }

  /** Store the secret value (write-only). */
  async setSecret(id: string, value: string): Promise<CredentialActionResult> {
    return this.absorbResult(await this.remote.setSecret({ id, value }))
  }

  /** Remove the stored secret value. */
  async unsetSecret(id: string): Promise<CredentialActionResult> {
    return this.absorbResult(await this.remote.unsetSecret({ id }))
  }

  /** Delete one credential and the stored secret behind it. */
  async remove(id: string): Promise<CredentialActionResult> {
    const carried = await this.remote.delete({ id })
    if (!carried.ok) return this.fail(carried.error.code)
    this.evict(id)
    return OK
  }
}

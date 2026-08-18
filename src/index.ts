/**
 * Named-credential manager: user-owned credentials the model reaches by
 * reference. One credential is one flat record holding exactly one secret
 * value — rotation means delete-and-recreate. One doctrine, three
 * consequences:
 *
 * **Metadata and values never mix.** A durable row carries id, name, notes,
 * expiry, and a `secretSet` flag; the secret value lives behind the derived
 * `DSHCM_<ID>` reference in the `ctx.credentials` seam, inheriting that
 * provider's storage policy (the local provider's 0700/0600 document, env
 * shadowing, empty-is-absent).
 *
 * **The model uses variables, not values.** Every configured secret is
 * injected into each model shell execution as a `DSH_CM_<ID>` environment
 * variable through `ctx.shellEnv`, resolved per execution, so a value reaches
 * a command's environment without entering the conversation. The host-only
 * {@link CredentialManagerService.read} is the deliberate escape hatch for
 * non-shell use.
 *
 * **A valueless credential is a placeholder.** The model creates a record
 * with a name and no secret; the user enters the value in the settings page.
 *
 * @module dsh-credential-manager
 */

import { Buffer } from 'node:buffer'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
// The credentials/updated cordis event declaration this service subscribes
// to is re-declared in ./types.ts (the published dsh-credentials package
// exports no ./types subpath; the shape is identical to upstream).
import type { DshEnvironmentKey } from '@deepseek-ai/dsh-shell'
// Type-only: pulls the `ctx.shellEnv` Context merge this service registers into.
import type {} from '@deepseek-ai/dsh-shell-env'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { credentialManagerDomainSpec } from './spec.ts'
import type { CredentialManagerRow } from './spec.ts'
import type {
  CredentialManagerCreateRequest,
  CredentialManagerCreateResult,
  CredentialManagerDeleteRequest,
  CredentialManagerDeleteResult,
  CredentialManagerDeleteValue,
  CredentialManagerGetRequest,
  CredentialManagerGetResult,
  CredentialManagerId,
  CredentialManagerInvalidExpireDate,
  CredentialManagerListRequest,
  CredentialManagerListResult,
  CredentialManagerNoteBlank,
  CredentialManagerNoteTooLarge,
  CredentialManagerRejected,
  CredentialManagerSetSecretRequest,
  CredentialManagerSetSecretResult,
  CredentialManagerSuccess,
  CredentialManagerUnsetSecretRequest,
  CredentialManagerUnsetSecretResult,
  CredentialManagerUpdateRequest,
  CredentialManagerUpdateResult,
  CredentialView,
} from './types.ts'

export type * from './types.ts'
export { credentialManagerDomainSpec, credentialManagerRowSchema } from './spec.ts'
export type { CredentialManagerRow } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    credentialManager: CredentialManagerService
  }
}

/** Deployment policy limits. */
export interface Config {
  /** Maximum UTF-8 byte length accepted for one user or LLM note. */
  readonly maxNoteBytes?: number
}

/** Schemastery config for the credential-manager policy. */
export const Config: s<Config> = s.object({
  maxNoteBytes: s.number().step(1).min(1).default(8192),
})

/** Mutable mirror of the persisted row for in-place edits before freezing. */
type MutableRow = { -readonly [K in keyof CredentialManagerRow]: CredentialManagerRow[K] }

/** Validated optional note or one explicit request failure. */
type ResolvedNote =
  | CredentialManagerSuccess<string | undefined>
  | CredentialManagerRejected<CredentialManagerNoteBlank | CredentialManagerNoteTooLarge>

/** Validated optional expiry day or one explicit request failure. */
type ResolvedExpireDate =
  | CredentialManagerSuccess<string | undefined>
  | CredentialManagerRejected<CredentialManagerInvalidExpireDate>

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const EXPIRE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SECRET_REF_PREFIX = 'DSHCM_'
const ENV_VAR_PREFIX = 'DSH_CM_'

/** Map one id onto its uppercase storage/variable form. */
function sanitizeSegment(value: string): string {
  return value.toUpperCase().replaceAll('-', '_')
}

/**
 * Derive the `ctx.credentials` reference storing the credential's value.
 * The id charset makes this mapping injective, so two credentials never
 * share a ref.
 * @param id - credential handle.
 * @returns the branded credential reference.
 */
export function credentialSecretRef(id: string): CredentialRef {
  return credentialRef(`${SECRET_REF_PREFIX}${sanitizeSegment(id)}`)
}

/**
 * Derive the per-execution shell variable carrying the credential's value.
 * @param id - credential handle.
 * @returns the `DSH_CM_*` variable name.
 */
export function credentialEnvVar(id: string): string {
  return `${ENV_VAR_PREFIX}${sanitizeSegment(id)}`
}

/** Derive a handle slug from a display name; empty when nothing survives. */
function deriveId(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+$/, '')
}

/** Today's date in host-local `YYYY-MM-DD` form (expiry compares on it). */
function todayLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** A `YYYY-MM-DD` string must also name a real calendar day. */
function isRealDate(value: string): boolean {
  if (!EXPIRE_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

/** Build a frozen success branch. */
function success<T>(value: T): CredentialManagerSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E extends { readonly code: string }>(error: E): CredentialManagerRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/** Result of the host-only {@link CredentialManagerService.read} escape hatch. */
export type CredentialManagerReadResult =
  | CredentialManagerSuccess<{
    readonly credential: CredentialView
    /** The resolved secret value, or `undefined` when none is stored. */
    readonly value?: string
  }>
  | CredentialManagerRejected<{ readonly code: 'not-found'; readonly id: string }>

/**
 * Named-credential service: a storage-domain metadata sidecar over the
 * `ctx.credentials` value seam, plus the shell-env contribution that projects
 * configured secrets into model shell executions as `DSH_CM_<ID>` variables.
 */
export class CredentialManagerService extends TypertRemoteService {
  static inject = ['storageDomain', 'credentials', 'shellEnv']

  /** Loader validation for the deployment policy. */
  static Config: s<Config> = Config

  private readonly maxNoteBytes: number
  private table?: KvTable<CredentialManagerId, CredentialManagerRow>
  /** Value cache keyed by env var name, feeding the SYNC shell-env resolver. */
  private readonly secretValues = new Map<string, string>()
  private disposeEnvContribution: (() => void) | undefined
  private tail: Promise<unknown> = Promise.resolve()
  private mutationAdmissionOpen = true

  /**
   * @param ctx - Host context carrying storage, the credential seam, and shell-env.
   * @param config - note-size policy.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'credentialManager')
    const maxNoteBytes = config.maxNoteBytes ?? 8192
    if (!Number.isSafeInteger(maxNoteBytes) || maxNoteBytes < 1) {
      throw new TypeError(`credential-manager: maxNoteBytes must be a positive safe integer, got ${String(maxNoteBytes)}`)
    }
    this.maxNoteBytes = maxNoteBytes
  }

  /** Open the metadata domain, prime the value cache, and join shell-env. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(credentialManagerDomainSpec)
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await this.tail
      this.disposeEnvContribution?.()
      await domain.close()
    }, 'credential-manager.dispose')
    this.table = domain.table('credentials')
    await this.refreshSecretCache()
    this.refreshEnvContribution()
    // The shell-env resolver is synchronous, so values ride this cache; the
    // credentials seam's update event (own writes and hot-reloaded external
    // edits alike) is what keeps it honest between refreshes.
    this.ctx.effect(() => this.ctx.on('credentials/updated', (ref) => {
      if (!ref.startsWith(SECRET_REF_PREFIX)) return
      void this.refreshSecretCache()
    }), 'credential-manager.credentialsWatch')
  }

  /** Read every credential, value-free. */
  @Remote('list')
  async list(_request: CredentialManagerListRequest): Promise<CredentialManagerListResult> {
    const credentials: CredentialView[] = []
    for (const [, row] of this.requireTable().entries()) {
      credentials.push(await this.viewOf(row))
    }
    return success(Object.freeze({ credentials: Object.freeze(credentials) }))
  }

  /** Read one credential by id, value-free. */
  @Remote('get')
  async get(request: CredentialManagerGetRequest): Promise<CredentialManagerGetResult> {
    const row = this.requireTable().get(request.id as CredentialManagerId)
    if (row === undefined) return rejected({ code: 'not-found', id: request.id })
    return success(await this.viewOf(row))
  }

  /**
   * Create one credential with no secret value — the shape the model's
   * `credential_create` tool and the settings page share.
   */
  @Remote('create')
  async create(request: CredentialManagerCreateRequest): Promise<CredentialManagerCreateResult> {
    const name = request.name.trim()
    if (name.length === 0) return rejected({ code: 'invalid-name' })
    const notes = this.resolveNote(request.userNotes)
    if (!notes.ok) return notes
    const expiry = this.resolveExpireDate(request.expireDate)
    if (!expiry.ok) return expiry
    const id = request.id ?? deriveId(name)
    if (!ID_PATTERN.test(id)) return rejected({ code: 'invalid-id', id })
    return this.enqueue(async () => {
      const table = this.requireTable()
      if (table.get(id as CredentialManagerId) !== undefined) {
        return rejected({ code: 'id-conflict' as const, id })
      }
      const now = Date.now()
      const row: CredentialManagerRow = Object.freeze({
        id: id as CredentialManagerId,
        name,
        secretSet: false,
        ...(notes.value === undefined ? {} : { userNotes: notes.value }),
        ...(expiry.value === undefined ? {} : { expireDate: expiry.value }),
        createdAt: now,
        updatedAt: now,
      })
      await table.put(row.id, row)
      this.committed(row.id)
      return success(await this.viewOf(row))
    })
  }

  /** Update the display name, notes, and/or expiry day of one credential. */
  @Remote('update')
  async update(request: CredentialManagerUpdateRequest): Promise<CredentialManagerUpdateResult> {
    if (request.name !== undefined && request.name.trim().length === 0) {
      return rejected({ code: 'invalid-name' })
    }
    const userNotes = request.userNotes === null
      ? success<string | undefined>(undefined)
      : this.resolveNote(request.userNotes)
    if (!userNotes.ok) return userNotes
    const llmNotes = request.llmNotes === null
      ? success<string | undefined>(undefined)
      : this.resolveNote(request.llmNotes)
    if (!llmNotes.ok) return llmNotes
    const expiry = request.expireDate === null
      ? success<string | undefined>(undefined)
      : this.resolveExpireDate(request.expireDate)
    if (!expiry.ok) return expiry
    return this.enqueue(async () => {
      const table = this.requireTable()
      const row = table.get(request.id as CredentialManagerId)
      if (row === undefined) return rejected({ code: 'not-found' as const, id: request.id })
      const draft: MutableRow = { ...row, updatedAt: Math.max(Date.now(), row.updatedAt) }
      if (request.name !== undefined) draft.name = request.name.trim()
      if (request.userNotes !== undefined) {
        if (userNotes.value === undefined) delete draft.userNotes
        else draft.userNotes = userNotes.value
      }
      if (request.llmNotes !== undefined) {
        if (llmNotes.value === undefined) delete draft.llmNotes
        else draft.llmNotes = llmNotes.value
      }
      if (request.expireDate !== undefined) {
        if (expiry.value === undefined) delete draft.expireDate
        else draft.expireDate = expiry.value
      }
      const next = Object.freeze(draft)
      await table.put(row.id, next)
      this.committed(row.id)
      return success(await this.viewOf(next))
    })
  }

  /**
   * Store the credential's secret value — the single operation whose request
   * carries a value. The value lands in the credential store; the row flips
   * its `secretSet` flag.
   */
  @Remote('setSecret')
  async setSecret(request: CredentialManagerSetSecretRequest): Promise<CredentialManagerSetSecretResult> {
    if (request.value.length === 0) return rejected({ code: 'secret-blank' })
    return this.enqueue(async () => {
      const table = this.requireTable()
      const row = table.get(request.id as CredentialManagerId)
      if (row === undefined) return rejected({ code: 'not-found' as const, id: request.id })
      try {
        await this.ctx.credentials.set(credentialSecretRef(row.id), request.value)
      } catch (error) {
        return rejected({
          code: 'secret-rejected' as const,
          message: error instanceof Error ? error.message : String(error),
        })
      }
      this.secretValues.set(credentialEnvVar(row.id), request.value)
      const next = Object.freeze({
        ...row,
        secretSet: true,
        updatedAt: Math.max(Date.now(), row.updatedAt),
      })
      await table.put(row.id, next)
      this.committed(row.id)
      return success(await this.viewOf(next))
    })
  }

  /** Remove the stored secret value; absence is a successful no-op. */
  @Remote('unsetSecret')
  async unsetSecret(request: CredentialManagerUnsetSecretRequest): Promise<CredentialManagerUnsetSecretResult> {
    return this.enqueue(async () => {
      const table = this.requireTable()
      const row = table.get(request.id as CredentialManagerId)
      if (row === undefined) return rejected({ code: 'not-found' as const, id: request.id })
      try {
        await this.ctx.credentials.unset(credentialSecretRef(row.id))
      } catch (error) {
        return rejected({
          code: 'secret-rejected' as const,
          message: error instanceof Error ? error.message : String(error),
        })
      }
      this.secretValues.delete(credentialEnvVar(row.id))
      const next = Object.freeze({
        ...row,
        secretSet: false,
        updatedAt: Math.max(Date.now(), row.updatedAt),
      })
      await table.put(row.id, next)
      this.committed(row.id)
      return success(await this.viewOf(next))
    })
  }

  /** Delete one credential and unset the secret reference behind it. */
  @Remote('delete')
  async delete(request: CredentialManagerDeleteRequest): Promise<CredentialManagerDeleteResult> {
    return this.enqueue(async () => {
      const table = this.requireTable()
      const row = table.get(request.id as CredentialManagerId)
      if (row === undefined) {
        return success<CredentialManagerDeleteValue>(Object.freeze({ absent: true }))
      }
      if (row.secretSet) {
        await this.ctx.credentials.unset(credentialSecretRef(row.id))
        this.secretValues.delete(credentialEnvVar(row.id))
      }
      await table.delete(row.id)
      this.committed(row.id)
      return success<CredentialManagerDeleteValue>(Object.freeze({ absent: true }))
    })
  }

  /**
   * Host-only escape hatch for the `credential_read` tool: resolve one
   * credential INCLUDING its secret value into the calling conversation.
   * Not a Remote method, so no browser path reaches the value.
   * @param id - credential handle.
   * @returns the view plus the resolved value when one is stored, or not-found.
   */
  async read(id: string): Promise<CredentialManagerReadResult> {
    const row = this.requireTable().get(id as CredentialManagerId)
    if (row === undefined) return rejected({ code: 'not-found', id })
    const resolved = row.secretSet
      ? await this.ctx.credentials.resolve(credentialSecretRef(row.id))
      : undefined
    return success(Object.freeze({
      credential: await this.viewOf(row),
      ...(resolved === undefined ? {} : { value: resolved.value }),
    }))
  }

  /**
   * Host-only writer for the `credential_update_note` tool: replace the
   * model's own annotation; a blank note clears it.
   * @param id - credential handle.
   * @param notes - replacement LLM notes, or blank to clear.
   */
  async updateLlmNote(id: string, notes: string): Promise<CredentialManagerUpdateResult> {
    if (notes.trim().length > 0 && Buffer.byteLength(notes, 'utf8') > this.maxNoteBytes) {
      return rejected({
        code: 'note-too-large',
        maxBytes: this.maxNoteBytes,
        actualBytes: Buffer.byteLength(notes, 'utf8'),
      })
    }
    return this.enqueue(async () => {
      const table = this.requireTable()
      const row = table.get(id as CredentialManagerId)
      if (row === undefined) return rejected({ code: 'not-found' as const, id })
      const draft: MutableRow = { ...row, updatedAt: Math.max(Date.now(), row.updatedAt) }
      if (notes.trim().length === 0) delete draft.llmNotes
      else draft.llmNotes = notes
      const next = Object.freeze(draft)
      await table.put(row.id, next)
      this.committed(row.id)
      return success(await this.viewOf(next))
    })
  }

  /** Validate optional note semantics and the configured byte bound. */
  private resolveNote(note: string | undefined): ResolvedNote {
    if (note === undefined) return success(undefined)
    if (note.trim().length === 0) return rejected({ code: 'note-blank' })
    const actualBytes = Buffer.byteLength(note, 'utf8')
    if (actualBytes > this.maxNoteBytes) {
      return rejected({ code: 'note-too-large', maxBytes: this.maxNoteBytes, actualBytes })
    }
    return success(note)
  }

  /** Validate the optional expiry day as a real `YYYY-MM-DD` calendar date. */
  private resolveExpireDate(expireDate: string | undefined): ResolvedExpireDate {
    if (expireDate === undefined) return success(undefined)
    if (!isRealDate(expireDate)) return rejected({ code: 'invalid-expire-date', expireDate })
    return success(expireDate)
  }

  /** Build one value-free view; presence and expiry only, never the value. */
  private async viewOf(row: CredentialManagerRow): Promise<CredentialView> {
    // describe answers absent refs too (configured:false plus writability),
    // so an env-shadowed placeholder reads read-only before any value exists.
    const info = await this.ctx.credentials.describe(credentialSecretRef(row.id))
    return Object.freeze({
      id: row.id,
      name: row.name,
      envVar: credentialEnvVar(row.id),
      configured: info.configured,
      writable: info.writable,
      ...(row.userNotes === undefined ? {} : { userNotes: row.userNotes }),
      ...(row.llmNotes === undefined ? {} : { llmNotes: row.llmNotes }),
      ...(row.expireDate === undefined ? {} : { expireDate: row.expireDate }),
      expired: row.expireDate !== undefined && row.expireDate < todayLocal(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  /** Fan out the committed-change event and refresh the env contribution. */
  private committed(id: CredentialManagerId): void {
    this.refreshEnvContribution()
    this.ctx.emit('credential-manager/updated', id)
  }

  /**
   * (Re)register the shell-env contributor for the CURRENT credential set.
   * Variable names are declared statically per registration, so a changed id
   * set means a fresh registration; values still resolve per execution.
   */
  private refreshEnvContribution(): void {
    this.disposeEnvContribution?.()
    this.disposeEnvContribution = undefined
    const table = this.table
    if (table === undefined) return
    const variables: Record<string, { description: string }> = {}
    for (const [, row] of table.entries()) {
      if (!row.secretSet) continue
      variables[credentialEnvVar(row.id)] = {
        description: `Managed credential "${row.name}" `
          + '(entered in Settings → Credentials; value never enters the conversation)',
      }
    }
    const declared = Object.keys(variables)
    this.disposeEnvContribution = this.ctx.shellEnv.register({
      name: 'credential-manager',
      variables: variables as Record<DshEnvironmentKey, { description: string }>,
      resolve: () => {
        const out: Record<string, string> = {}
        for (const key of declared) {
          const value = this.secretValues.get(key)
          if (value !== undefined) out[key] = value
        }
        return out as Readonly<Partial<Record<DshEnvironmentKey, string>>>
      },
    })
  }

  /** Reprime the env-facing value cache from the credential seam. */
  private async refreshSecretCache(): Promise<void> {
    const table = this.table
    if (table === undefined) return
    const live = new Set<string>()
    for (const [, row] of table.entries()) {
      if (!row.secretSet) continue
      const envVar = credentialEnvVar(row.id)
      live.add(envVar)
      const resolved = await this.ctx.credentials.resolve(credentialSecretRef(row.id))
      if (resolved === undefined) this.secretValues.delete(envVar)
      else this.secretValues.set(envVar, resolved.value)
    }
    for (const envVar of [...this.secretValues.keys()]) {
      if (!live.has(envVar)) this.secretValues.delete(envVar)
    }
  }

  /** Serialize mutations so a read-modify-write never interleaves. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error('credential-manager: service is disposing'))
    }
    const result = this.tail.then(operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  /** Resolve the initialized durable table or fail a broken service lifecycle. */
  private requireTable(): KvTable<CredentialManagerId, CredentialManagerRow> {
    if (this.table === undefined) {
      throw new Error('credential-manager: durable domain is not initialized')
    }
    return this.table
  }
}

export default CredentialManagerService

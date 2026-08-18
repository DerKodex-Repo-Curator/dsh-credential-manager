/**
 * Client-safe type surface of the named-credential manager: wire payloads and
 * the Cordis event declaration. Types only — no runtime code, and nothing
 * here reaches a Host-only symbol, so a Client compilation face reads exactly
 * the signatures the Host emits. Secret VALUES never appear in this
 * vocabulary: they cross the wire in exactly one direction, inside
 * {@link CredentialManagerSetSecretRequest}.
 *
 * One credential is one flat record holding exactly one secret value: no
 * key dimension, no grouping. Rotation means delete-and-recreate.
 *
 * @module dsh-credential-manager/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

/** Nominal identity of one managed credential record. */
export type CredentialManagerId = Branded<'CredentialManagerId'>

/**
 * One managed credential record — one flat record with one optional secret
 * value, described value-free: whether a value is stored, whether the
 * credential store accepts a write, and the `DSH_CM_*` shell variable name
 * that carries the value into model shell executions.
 */
export interface CredentialView {
  /** Stable immutable handle. */
  readonly id: CredentialManagerId
  /** Display name. */
  readonly name: string
  /** Shell variable injected per execution, for example `DSH_CM_MYAPI`. */
  readonly envVar: string
  /** Whether the credential store currently resolves a value. */
  readonly configured: boolean
  /** Whether `setSecret`/`unsetSecret` can currently affect the stored value. */
  readonly writable: boolean
  /** The user's annotation for the model to read. */
  readonly userNotes?: string
  /** The model's own annotation for its future self (user-editable in Settings too). */
  readonly llmNotes?: string
  /** Optional expiry day `YYYY-MM-DD`; informational only, never blocks injection. */
  readonly expireDate?: string
  /** Whether `expireDate` has passed (end of that day, host-local). */
  readonly expired: boolean
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}

/** Read every managed credential. */
export interface CredentialManagerListRequest {}

/** All current credentials, in first-creation order. */
export interface CredentialManagerListValue {
  /** Fresh immutable value-free views. */
  readonly credentials: readonly CredentialView[]
}

/** Read one credential by id. */
export interface CredentialManagerGetRequest {
  /** Credential handle. */
  readonly id: string
}

/**
 * Create one credential. `id` may be omitted to derive a slug from `name`.
 * A record created without a following `setSecret` is a placeholder awaiting
 * user entry in the settings page.
 */
export interface CredentialManagerCreateRequest {
  /** Display name; must contain a non-whitespace character. */
  readonly name: string
  /** Optional explicit handle `[a-z0-9][a-z0-9-]*`; derived from `name` when absent. */
  readonly id?: string
  /** Optional user annotation for the model. */
  readonly userNotes?: string
  /** Optional expiry day `YYYY-MM-DD`. */
  readonly expireDate?: string
}

/**
 * Update the display name and/or the notes and/or the expiry day; `null`
 * clears the targeted field.
 */
export interface CredentialManagerUpdateRequest {
  /** Credential handle. */
  readonly id: string
  /** Replacement display name when present. */
  readonly name?: string
  /** Replacement user notes, or `null` to clear. */
  readonly userNotes?: string | null
  /** Replacement LLM notes, or `null` to clear. */
  readonly llmNotes?: string | null
  /** Replacement expiry day `YYYY-MM-DD`, or `null` to clear. */
  readonly expireDate?: string | null
}

/**
 * Store the credential's secret value — the single direction a value crosses
 * this wire. Rejects a blank value (use `unsetSecret`).
 */
export interface CredentialManagerSetSecretRequest {
  /** Credential handle. */
  readonly id: string
  /** Non-empty secret value. */
  readonly value: string
}

/** Remove the stored secret value; removing an absent value is a no-op. */
export interface CredentialManagerUnsetSecretRequest {
  /** Credential handle. */
  readonly id: string
}

/** Delete one credential and the stored secret value behind it. */
export interface CredentialManagerDeleteRequest {
  /** Credential handle. */
  readonly id: string
}

/** Idempotent deletion acknowledgement. */
export interface CredentialManagerDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}

/** The id does not name a managed credential. */
export interface CredentialManagerNotFound {
  readonly code: 'not-found'
  readonly id: string
}

/** A supplied display name contains no non-whitespace character. */
export interface CredentialManagerInvalidName {
  readonly code: 'invalid-name'
}

/**
 * A supplied or derived id is not `[a-z0-9][a-z0-9-]*`. A name without any
 * ASCII letter or digit derives an empty slug, so an explicit `id` is
 * required.
 */
export interface CredentialManagerInvalidId {
  readonly code: 'invalid-id'
  readonly id: string
}

/** The id already names a managed credential. */
export interface CredentialManagerIdConflict {
  readonly code: 'id-conflict'
  readonly id: string
}

/** A supplied secret value is empty; an empty stored value is absent. */
export interface CredentialManagerSecretBlank {
  readonly code: 'secret-blank'
}

/** The credential store rejected the write, typically env shadowing. */
export interface CredentialManagerSecretRejected {
  readonly code: 'secret-rejected'
  readonly message: string
}

/** A supplied note contains no non-whitespace character. */
export interface CredentialManagerNoteBlank {
  readonly code: 'note-blank'
}

/** A supplied note exceeds the configured UTF-8 byte limit. */
export interface CredentialManagerNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}

/** A supplied expiry day is not a valid `YYYY-MM-DD` calendar date. */
export interface CredentialManagerInvalidExpireDate {
  readonly code: 'invalid-expire-date'
  readonly expireDate: string
}

/** Successful public operation result. */
export interface CredentialManagerSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected public operation result with a stable business failure. */
export interface CredentialManagerRejected<E extends { readonly code: string }> {
  readonly ok: false
  readonly error: E
}

/** Result returned by the `list` operation. */
export type CredentialManagerListResult = CredentialManagerSuccess<CredentialManagerListValue>

/** Result returned by the `get` operation. */
export type CredentialManagerGetResult =
  | CredentialManagerSuccess<CredentialView>
  | CredentialManagerRejected<CredentialManagerNotFound>

/** Result returned by the `create` operation. */
export type CredentialManagerCreateResult =
  | CredentialManagerSuccess<CredentialView>
  | CredentialManagerRejected<
    | CredentialManagerInvalidName
    | CredentialManagerInvalidId
    | CredentialManagerIdConflict
    | CredentialManagerNoteBlank
    | CredentialManagerNoteTooLarge
    | CredentialManagerInvalidExpireDate
  >

/** Result returned by the `update` operation. */
export type CredentialManagerUpdateResult =
  | CredentialManagerSuccess<CredentialView>
  | CredentialManagerRejected<
    | CredentialManagerNotFound
    | CredentialManagerInvalidName
    | CredentialManagerNoteBlank
    | CredentialManagerNoteTooLarge
    | CredentialManagerInvalidExpireDate
  >

/** Result returned by the `setSecret` operation. */
export type CredentialManagerSetSecretResult =
  | CredentialManagerSuccess<CredentialView>
  | CredentialManagerRejected<
    | CredentialManagerNotFound
    | CredentialManagerSecretBlank
    | CredentialManagerSecretRejected
  >

/** Result returned by the `unsetSecret` operation. */
export type CredentialManagerUnsetSecretResult =
  | CredentialManagerSuccess<CredentialView>
  | CredentialManagerRejected<
    | CredentialManagerNotFound
    | CredentialManagerSecretRejected
  >

/** Result returned by the `delete` operation. */
export type CredentialManagerDeleteResult =
  | CredentialManagerSuccess<CredentialManagerDeleteValue>

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Committed change to one managed credential: create, update, secret
     * set/unset, or deletion. Listener failures are contained and logged
     * without changing the committed operation's outcome.
     * @param id - the credential whose record changed.
     * @mode emit
     */
    'credential-manager/updated'(id: CredentialManagerId): void
    /**
     * A credential value behind the `ctx.credentials` seam changed. Mirrors
     * the declaration in `@deepseek-ai/dsh-credentials` (whose published
     * package exports no ./types subpath); identical shape, so a compile
     * graph containing both stays legal.
     * @param ref - the credential reference that changed.
     */
    'credentials/updated'(ref: CredentialRef): void
  }
}

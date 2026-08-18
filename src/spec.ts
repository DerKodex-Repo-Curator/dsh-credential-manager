/**
 * Durable storage-domain declaration for managed-credential metadata. Rows
 * carry NO secret value: a row records only whether a value was ever set, and
 * the value itself lives behind the derived `DSHCM_<ID>` reference in the
 * `ctx.credentials` seam.
 * @module dsh-credential-manager/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CredentialManagerId } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Persisted credential metadata row: one flat record, one secret value. */
export interface CredentialManagerRow {
  readonly id: CredentialManagerId
  readonly name: string
  /** Whether a secret value was set through the seam (set/unset bookkeeping). */
  readonly secretSet: boolean
  readonly userNotes?: string
  readonly llmNotes?: string
  /** Optional expiry day `YYYY-MM-DD`; informational only. */
  readonly expireDate?: string
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * Runtime schema for one credential's persisted metadata row.
 */
// Zod infers transformed branded fields structurally, so it cannot name the
// public interface even though every branded output is created below.
export const credentialManagerRowSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/)
    .transform(value => value as CredentialManagerId),
  name: z.string().min(1),
  secretSet: z.boolean(),
  userNotes: z.string().optional(),
  llmNotes: z.string().optional(),
  expireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdAt: nonNegativeSafeInteger,
  updatedAt: nonNegativeSafeInteger,
}).refine(row => row.updatedAt >= row.createdAt, {
  path: ['updatedAt'],
  message: 'credential manager updatedAt must not precede createdAt',
}) as unknown as z.ZodType<CredentialManagerRow>

/** One metadata row per credential id; the value stays in the credential store. */
export const credentialManagerDomainSpec = defineDomain({
  name: 'credential_manager',
  version: 0,
  tables: {
    credentials: domainTable<CredentialManagerId, CredentialManagerRow>(credentialManagerRowSchema),
  },
})

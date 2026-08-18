/**
 * Service tests for `@deepseek-ai/dsh-credential-manager`: CRUD over the
 * metadata sidecar (one flat record, one secret value), secret values
 * confined to the credentials seam, shell-env projection, expiry views, and
 * the committed-change event.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import CredentialProvider from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import CredentialManagerService, {
  credentialEnvVar,
  credentialSecretRef,
} from '../src/index.ts'
import type { CredentialView } from '../src/index.ts'

/** In-memory credentials provider: one always-writable `memory` source. */
// The published dsh-credentials names the abstract provider `Credentials` (default
// export); the monorepo later renamed it CredentialProvider. Same seam, same methods.
class MemoryCredentials extends CredentialProvider {
  private readonly store = new Map<string, string>()

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.store.get(ref)
    return Promise.resolve(value === undefined || value.length === 0
      ? undefined
      : { value, source: 'memory' })
  }

  override describe(ref: CredentialRef): Promise<CredentialInfo> {
    const value = this.store.get(ref)
    const configured = value !== undefined && value.length > 0
    return Promise.resolve({ configured, ...configured ? { source: 'memory' } : {}, writable: true })
  }

  override set(ref: CredentialRef, value: string): Promise<void> {
    if (value.length === 0) {
      return Promise.reject(new Error('memory credentials: an empty value cannot be stored; use unset'))
    }
    this.store.set(ref, value)
    this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }

  override unset(ref: CredentialRef): Promise<void> {
    if (this.store.delete(ref)) this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }
}

interface TestHarness {
  readonly ctx: Context
  readonly root: string
  readonly events: string[]
  dispose(): Promise<void>
}

const harnesses: TestHarness[] = []

/** Compose the service over the real storage stack, memory credentials, and shell-env. */
async function harness(): Promise<TestHarness> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-credential-manager-test-'))
  const ctx = new Context()
  const events: string[] = []
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(ShellEnv)
    await ctx.plugin(CredentialManagerService, {})
    ctx.on('credential-manager/updated', id => { events.push(id) })
  } catch (error) {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    throw error
  }
  const value: TestHarness = {
    ctx,
    root,
    events,
    async dispose() {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    },
  }
  harnesses.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map(value => value.dispose()))
})

/** Minimal shell tool execution for `shellEnv.collect`. */
function execution(): ToolExecution {
  return {
    signal: new AbortController().signal,
    token: Symbol('credential-manager-test'),
    callId: 'credential-manager-call',
    rootCallId: 'credential-manager-call',
    name: 'bash',
    arguments: { command: 'true' },
  } as unknown as ToolExecution
}

function expectCredential(result: { ok: boolean } & { value?: unknown; error?: unknown }): CredentialView {
  if (!result.ok) throw new Error(`expected credential view, got ${JSON.stringify(result.error)}`)
  return result.value as CredentialView
}

describe('CredentialManagerService', () => {
  it('publishes the exact Gateway namespace and Remote method names', async () => {
    const { ctx } = await harness()
    const binding = ctx.credentialManager.typertRemote
    expect(binding.serviceKey).toBe('credentialManager')
    expect(binding.namespace).toBe('credentialManager')
    expect(remoteMethods(ctx.credentialManager).map(entry => entry.method).sort()).toEqual([
      'create', 'delete', 'get', 'list', 'setSecret', 'unsetSecret', 'update',
    ])
  })

  it('creates an empty placeholder credential derivable from the display name', async () => {
    const { ctx, events } = await harness()
    const created = expectCredential(await ctx.credentialManager.create({ name: 'My API' }))
    expect(created.id).toBe('my-api')
    expect(created.name).toBe('My API')
    expect(created.configured).toBe(false)
    expect(created.envVar).toBe('DSH_CM_MY_API')
    expect(created.expired).toBe(false)
    expect(created.createdAt).toBe(created.updatedAt)

    const listed = await ctx.credentialManager.list({})
    expect(listed.value.credentials.map(credential => credential.id)).toEqual(['my-api'])
    expect(events).toEqual(['my-api'])
  })

  it('rejects invalid names, ids, expiry days, and conflicts', async () => {
    const { ctx } = await harness()
    expect(await ctx.credentialManager.create({ name: '  ' })).toEqual({
      ok: false, error: { code: 'invalid-name' },
    })
    // A name without ASCII letters or digits derives an empty slug.
    expect(await ctx.credentialManager.create({ name: '凭据' })).toEqual({
      ok: false, error: { code: 'invalid-id', id: '' },
    })
    expect(await ctx.credentialManager.create({ name: '凭据', id: 'My_Bad' })).toEqual({
      ok: false, error: { code: 'invalid-id', id: 'My_Bad' },
    })
    expect(await ctx.credentialManager.create({ name: 'x', expireDate: '2026-13-01' })).toEqual({
      ok: false, error: { code: 'invalid-expire-date', expireDate: '2026-13-01' },
    })
    expect(await ctx.credentialManager.create({ name: 'x', expireDate: 'next week' })).toEqual({
      ok: false, error: { code: 'invalid-expire-date', expireDate: 'next week' },
    })
    expectCredential(await ctx.credentialManager.create({ name: '凭据', id: 'my-cred' }))
    expect(await ctx.credentialManager.create({ name: 'again', id: 'my-cred' })).toEqual({
      ok: false, error: { code: 'id-conflict', id: 'my-cred' },
    })
  })

  it('stores the secret value only in the credentials seam and projects the env var', async () => {
    const { ctx, events } = await harness()
    expectCredential(await ctx.credentialManager.create({ name: 'My API', userNotes: 'prod key' }))
    const updated = expectCredential(await ctx.credentialManager.setSecret({
      id: 'my-api', value: 'sk-secret',
    }))
    expect(updated.configured).toBe(true)
    expect(updated.writable).toBe(true)
    expect(updated.envVar).toBe('DSH_CM_MY_API')

    // The value lives behind the derived reference, never in the row.
    await expect(ctx.credentials.resolve(credentialSecretRef('my-api')))
      .resolves.toEqual({ value: 'sk-secret', source: 'memory' })
    expect(credentialSecretRef('my-api')).toBe('DSHCM_MY_API')
    expect(credentialEnvVar('my-api')).toBe('DSH_CM_MY_API')

    // shell-env projection: declared, described, and injected per execution.
    expect(ctx.shellEnv.list()).toContainEqual({
      contributor: 'credential-manager',
      key: 'DSH_CM_MY_API',
      description: expect.stringContaining('My API') as unknown as string,
    })
    expect(ctx.shellEnv.collect(execution()).DSH_CM_MY_API).toBe('sk-secret')

    // The host-only escape hatch resolves the value for the read tool.
    const read = await ctx.credentialManager.read('my-api')
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.value.value).toBe('sk-secret')
    expect(events).toEqual(['my-api', 'my-api'])
  })

  it('rejects invalid secret writes and resolves the unset path', async () => {
    const { ctx } = await harness()
    expectCredential(await ctx.credentialManager.create({ name: 'svc' }))
    expect(await ctx.credentialManager.setSecret({ id: 'svc', value: '' })).toEqual({
      ok: false, error: { code: 'secret-blank' },
    })
    expect(await ctx.credentialManager.setSecret({ id: 'missing', value: 'x' })).toEqual({
      ok: false, error: { code: 'not-found', id: 'missing' },
    })

    expectCredential(await ctx.credentialManager.setSecret({ id: 'svc', value: 'sk-1' }))
    const cleared = expectCredential(await ctx.credentialManager.unsetSecret({ id: 'svc' }))
    expect(cleared.configured).toBe(false)
    await expect(ctx.credentials.resolve(credentialSecretRef('svc'))).resolves.toBeUndefined()
    expect(ctx.shellEnv.collect(execution())).not.toHaveProperty('DSH_CM_SVC')
    const read = await ctx.credentialManager.read('svc')
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.value.value).toBeUndefined()
  })

  it('deletes a credential together with the stored secret value', async () => {
    const { ctx } = await harness()
    expectCredential(await ctx.credentialManager.create({ name: 'svc' }))
    expectCredential(await ctx.credentialManager.setSecret({ id: 'svc', value: 'sk-1' }))

    await expect(ctx.credentialManager.delete({ id: 'svc' })).resolves.toEqual({ ok: true, value: { absent: true } })
    await expect(ctx.credentialManager.delete({ id: 'svc' })).resolves.toEqual({ ok: true, value: { absent: true } })
    expect(await ctx.credentialManager.get({ id: 'svc' })).toEqual({
      ok: false, error: { code: 'not-found', id: 'svc' },
    })
    await expect(ctx.credentials.resolve(credentialSecretRef('svc'))).resolves.toBeUndefined()
    expect(ctx.shellEnv.list().filter(entry => entry.contributor === 'credential-manager')).toEqual([])
  })

  it('updates the name, both note channels, and the expiry day with validation', async () => {
    const { ctx } = await harness()
    expectCredential(await ctx.credentialManager.create({
      name: 'svc', userNotes: 'rotate monthly', expireDate: '2999-01-01',
    }))
    const renamed = expectCredential(await ctx.credentialManager.update({ id: 'svc', name: 'svc-prod' }))
    expect(renamed.name).toBe('svc-prod')
    expect(renamed.userNotes).toBe('rotate monthly')
    expect(renamed.expireDate).toBe('2999-01-01')
    expect(renamed.expired).toBe(false)

    const cleared = expectCredential(await ctx.credentialManager.update({
      id: 'svc', userNotes: null, expireDate: null,
    }))
    expect(cleared.userNotes).toBeUndefined()
    expect(cleared.expireDate).toBeUndefined()
    expect(await ctx.credentialManager.update({ id: 'svc', userNotes: '  ' })).toEqual({
      ok: false, error: { code: 'note-blank' },
    })
    expect(await ctx.credentialManager.update({ id: 'svc', expireDate: '01/01/2030' })).toEqual({
      ok: false, error: { code: 'invalid-expire-date', expireDate: '01/01/2030' },
    })
    expect(await ctx.credentialManager.update({ id: 'missing', name: 'x' })).toEqual({
      ok: false, error: { code: 'not-found', id: 'missing' },
    })

    // A past day reads expired; expiry never blocks env injection.
    expectCredential(await ctx.credentialManager.setSecret({ id: 'svc', value: 'sk-1' }))
    const stale = expectCredential(await ctx.credentialManager.update({ id: 'svc', expireDate: '2000-01-01' }))
    expect(stale.expired).toBe(true)
    expect(ctx.shellEnv.collect(execution()).DSH_CM_SVC).toBe('sk-1')

    // The LLM note channel: written by the tool path, editable via update too.
    const noted = expectCredential(await ctx.credentialManager.updateLlmNote('svc', 'used for deploys'))
    expect(noted.llmNotes).toBe('used for deploys')
    const userEdited = expectCredential(await ctx.credentialManager.update({ id: 'svc', llmNotes: 'user clarified' }))
    expect(userEdited.llmNotes).toBe('user clarified')
    const wiped = expectCredential(await ctx.credentialManager.updateLlmNote('svc', '   '))
    expect(wiped.llmNotes).toBeUndefined()
    expect(await ctx.credentialManager.updateLlmNote('missing', 'x')).toEqual({
      ok: false, error: { code: 'not-found', id: 'missing' },
    })
  })

  it('persists metadata rows across a full restart of the stack', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-credential-manager-restart-'))
    const mount = async (): Promise<Context> => {
      const ctx = new Context()
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      await ctx.plugin(MemoryCredentials)
      await ctx.plugin(ShellEnv)
      await ctx.plugin(CredentialManagerService, {})
      return ctx
    }
    try {
      const first = await mount()
      expectCredential(await first.credentialManager.create({ name: 'svc', expireDate: '2999-01-01' }))
      expectCredential(await first.credentialManager.setSecret({ id: 'svc', value: 'sk-1' }))
      await first.fiber.dispose()

      const second = await mount()
      const reopened = expectCredential(await second.credentialManager.get({ id: 'svc' }))
      expect(reopened.name).toBe('svc')
      expect(reopened.expireDate).toBe('2999-01-01')
      // The flag survives in the row; the fresh memory source holds no value.
      expect(reopened.configured).toBe(false)
      expect(reopened.envVar).toBe('DSH_CM_SVC')
      await second.fiber.dispose()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

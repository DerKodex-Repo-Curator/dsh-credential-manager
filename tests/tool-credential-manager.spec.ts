/**
 * Tool tests for `@deepseek-ai/dsh-tool-credential-manager`: registration,
 * the service-absent fallback, and the argument/result mapping over a fake
 * credential-manager service (one flat record, one secret value).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { CredentialView } from '../src/types.ts'

import * as tool from '../src/tools.ts'

const testToolSignal = new AbortController().signal

function view(over: Partial<CredentialView> = {}): CredentialView {
  return {
    id: 'my-api' as CredentialView['id'],
    name: 'My API',
    envVar: 'DSH_CM_MY_API',
    configured: false,
    writable: true,
    expired: false,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

interface FakeManager {
  list: (...args: unknown[]) => unknown
  create: (...args: unknown[]) => unknown
  read: (...args: unknown[]) => unknown
  updateLlmNote: (...args: unknown[]) => unknown
}

async function setup(manager?: FakeManager): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  if (manager !== undefined) ctx.provide('credentialManager', manager as never)
  await ctx.plugin(tool)
  return ctx
}

let callCounter = 0
function callTool(ctx: Context, name: string, args: unknown) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name,
    arguments: args,
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-tool-credential-manager', () => {
  it('registers the four credential tools and the policy section', async () => {
    const ctx = await setup()
    const names = ctx.tools.schemas().map(schema => schema.name)
    for (const name of [
      'credential_list', 'credential_create', 'credential_read', 'credential_update_note',
    ]) {
      expect(names).toContain(name)
    }
    const create = ctx.tools.schemas().find(schema => schema.name === 'credential_create')!
    const props = (create.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['expire_date', 'id', 'name', 'user_notes'])
    expect(create.description).toContain('Never ask the user to paste secrets')
  })

  it('answers a clean unavailable error when the service is not mounted', async () => {
    const ctx = await setup()
    const result = await callTool(ctx, 'credential_list', {})
    expect(text(result)).toContain('credential manager is not mounted')
  })

  it('credential_create maps arguments and returns the user instruction', async () => {
    const seen: unknown[] = []
    const ctx = await setup({
      list: () => { throw new Error('unused') },
      create: (request: unknown) => {
        seen.push(request)
        return Promise.resolve({ ok: true, value: view() })
      },
      read: () => { throw new Error('unused') },
      updateLlmNote: () => { throw new Error('unused') },
    })
    const result = await callTool(ctx, 'credential_create', {
      name: 'My API', user_notes: 'prod', expire_date: '2026-12-31',
    })
    expect(result.isError).toBe(false)
    expect(seen).toEqual([{ name: 'My API', userNotes: 'prod', expireDate: '2026-12-31' }])
    const rendered = text(result)
    expect(rendered).toContain('Settings → Credentials')
    expect(rendered).toContain('"my-api"')
    expect(rendered).toContain('$DSH_CM_MY_API')
  })

  it('credential_create renders business failures as compact text', async () => {
    const ctx = await setup({
      list: () => { throw new Error('unused') },
      create: () => Promise.resolve({ ok: false, error: { code: 'id-conflict', id: 'my-api' } }),
      read: () => { throw new Error('unused') },
      updateLlmNote: () => { throw new Error('unused') },
    })
    const result = await callTool(ctx, 'credential_create', { name: 'My API' })
    expect(text(result)).toContain('id-conflict')
  })

  it('credential_list passes views through without values', async () => {
    const ctx = await setup({
      list: () => Promise.resolve({
        ok: true,
        value: {
          credentials: [view({ configured: true, expireDate: '2000-01-01', expired: true })],
        },
      }),
      create: () => { throw new Error('unused') },
      read: () => { throw new Error('unused') },
      updateLlmNote: () => { throw new Error('unused') },
    })
    const result = await callTool(ctx, 'credential_list', {})
    expect(result.isError).toBe(false)
    const rendered = text(result)
    expect(rendered).toContain('DSH_CM_MY_API')
    expect(rendered).toContain('"expired":true')
    expect(rendered).not.toContain('sk-')
  })

  it('credential_read returns the value and credential_update_note forwards the note', async () => {
    const noted: unknown[][] = []
    const ctx = await setup({
      list: () => { throw new Error('unused') },
      create: () => { throw new Error('unused') },
      read: (id: unknown) => Promise.resolve(id === 'my-api'
        ? { ok: true, value: { credential: view({ configured: true }), value: 'sk-secret' } }
        : { ok: false, error: { code: 'not-found', id } }),
      updateLlmNote: (...args: unknown[]) => {
        noted.push(args)
        return Promise.resolve({ ok: true, value: view({ llmNotes: 'used for deploys' }) })
      },
    })
    const read = await callTool(ctx, 'credential_read', { id: 'my-api' })
    expect(text(read)).toContain('sk-secret')
    const missing = await callTool(ctx, 'credential_read', { id: 'nope' })
    expect(text(missing)).toContain('not-found')

    const note = await callTool(ctx, 'credential_update_note', { id: 'my-api', llm_notes: 'used for deploys' })
    expect(note.isError).toBe(false)
    expect(noted).toEqual([['my-api', 'used for deploys']])
    expect(text(note)).toContain('used for deploys')
  })
})

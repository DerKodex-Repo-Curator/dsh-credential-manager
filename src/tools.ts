/**
 * Model-facing credential-manager tools: `credential_list`, `credential_create`,
 * `credential_read`, and `credential_update_note` over the host-plane
 * `ctx.credentialManager` service. One credential is one flat record with one
 * secret value, injected as `DSH_CM_<ID>`. The service is resolved lazily with
 * `ctx.get` so a deployment (or surface) without the manager mounts these
 * tools into a clean "unavailable" answer rather than an activation failure.
 * @module dsh-credential-manager/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
// Type-only: pulls the ctx.credentialManager Context merge.
import type {} from './index.ts'
import type { CredentialView } from './types.ts'

export const name = 'tool-credential-manager'
export const inject = ['tools', 'systemPrompt']

/** Plugin config — the schema supplies the defaults. */
export interface Config {
  /**
   * Ordering weight of the credential policy section in the system prompt.
   * Sections assemble in ascending order; the shipped preset catalog keeps
   * tool policies in the 110–130 band.
   */
  promptOrder?: number
}

/** Schemastery config: every knob optional, every knob defaulted. */
export const Config: z<Config> = z.object({
  promptOrder: z.number().step(1).default(116),
})

/** Value-free credential view shared by the list/create/update outputs. */
const CREDENTIAL_VIEW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    envVar: { type: 'string', required: true },
    configured: { type: 'boolean', required: true },
    writable: { type: 'boolean', required: true },
    userNotes: { type: 'string' },
    llmNotes: { type: 'string' },
    expireDate: { type: 'string' },
    expired: { type: 'boolean', required: true },
    createdAt: { type: 'integer', required: true },
    updatedAt: { type: 'integer', required: true },
  },
} as const

const ERROR_VALUE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string', required: true },
  },
} as const

const LIST_OUTPUT = {
  schema: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          credentials: { type: 'array', required: true, items: CREDENTIAL_VIEW },
        },
      },
      ERROR_VALUE,
    ],
  } as const,
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
}

const CREATE_OUTPUT = {
  schema: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          credential: CREDENTIAL_VIEW,
          instruction: { type: 'string', required: true },
        },
      },
      ERROR_VALUE,
    ],
  } as const,
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
}

const READ_OUTPUT = {
  schema: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          credential: CREDENTIAL_VIEW,
          value: { type: 'string' },
        },
      },
      ERROR_VALUE,
    ],
  } as const,
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
}

const NOTE_OUTPUT = {
  schema: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          credential: CREDENTIAL_VIEW,
        },
      },
      ERROR_VALUE,
    ],
  } as const,
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
}

const LIST_DESCRIPTION =
  'List the user-managed credentials saved in the harness credential manager: name, id, '
  + 'user and LLM notes, expiry day and expired flag, whether a secret value is set, and '
  + 'the DSH_CM_* environment variable name that carries each value into bash/pwsh '
  + 'commands. Secret values are never included. Call this when a task may involve a saved '
  + 'API key, token, or login.'

const CREATE_DESCRIPTION =
  'Create one EMPTY credential record (name only, no secret) in the harness credential '
  + 'manager when the conversation involves an API key, token, or login the user has not '
  + 'provided. Never ask the user to paste secrets into the chat: create the placeholder, '
  + 'then ask the user to enter the value in Settings → Credentials. Afterwards use the '
  + 'secret through the DSH_CM_* environment variable listed by credential_list.'

const READ_DESCRIPTION =
  'LAST RESORT: read one credential INCLUDING its secret value into the conversation. '
  + 'Prefer the DSH_CM_* environment variable in shell commands, which keeps the value out '
  + 'of the conversation entirely. Use this only when the variable path cannot work (for '
  + 'example the value must be embedded in a non-shell API call), and never echo the value '
  + 'back.'

const NOTE_DESCRIPTION =
  'Update your own annotation (llmNotes) on one credential — your running note before, '
  + 'during, and after using it: which service it authenticated, usage caveats, expiry or '
  + 'rotation status. Pass an empty llm_notes to clear. You cannot modify the secret or the '
  + 'user notes with this tool.'

/** Compact service-absent answer shared by every tool. */
function unavailable(): { error: string } {
  return {
    error: 'the credential manager is not mounted in this deployment '
      + '(no dsh-credential-manager row in the host composition)',
  }
}

/** Render one business failure branch as compact model-facing text. */
function failure(error: { readonly code: string } & { readonly message?: string }): { error: string } {
  return { error: 'message' in error && error.message !== undefined
    ? `${error.code}: ${error.message}`
    : error.code }
}

/**
 * Plain-JSON projection of one value-free view: the declared output schema
 * owns an unbranded id, and absent fields stay absent.
 */
function viewJson(view: CredentialView) {
  return {
    id: view.id as string,
    name: view.name,
    envVar: view.envVar,
    configured: view.configured,
    writable: view.writable,
    ...view.userNotes === undefined ? {} : { userNotes: view.userNotes },
    ...view.llmNotes === undefined ? {} : { llmNotes: view.llmNotes },
    ...view.expireDate === undefined ? {} : { expireDate: view.expireDate },
    expired: view.expired,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  }
}

/** Generic, args-only pending presentation shared by the credential tools. */
function present(title: string, kind: 'read' | 'other', rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/** The one policy section teaching the variable-first credential workflow. */
const GUIDANCE =
  'Use the credential tools for user-managed API keys, tokens, and logins. When a task '
  + 'needs a credential, call credential_list and USE the secrets through their DSH_CM_* '
  + 'environment variables in bash/pwsh commands (for example `$DSH_CM_MYAPI`) — the '
  + 'values are injected per command execution and never enter the conversation. Never print, '
  + 'echo, or otherwise reveal those variables. An entry whose `expired` flag is true is '
  + 'past its user-declared expire_date: still usable, but tell the user it should be '
  + 'rotated. When the user has not saved a needed credential, call credential_create with '
  + 'a name to open an empty placeholder and ask the user to enter the value in Settings → '
  + 'Credentials; do not ask them to paste secrets into the chat. credential_read pulls a '
  + 'secret value into the conversation and is the documented last resort for non-shell '
  + 'use. Record your own usage context (for example "rotated in August" or "likely '
  + 'expired") with credential_update_note.'

/** Register the four credential tools and their shared policy section. */
export function apply(ctx: Context, config: Config): void {
  ctx.systemPrompt.section({
    name: 'tool:credential-manager',
    order: config.promptOrder ?? 116,
    text: GUIDANCE,
  })

  ctx.tools.register(defineTool({
    name: 'credential_list',
    description: LIST_DESCRIPTION,
    parameters: {},
    output: LIST_OUTPUT,
    async execute() {
      const manager = ctx.get('credentialManager')
      if (manager === undefined) return unavailable()
      const result = await manager.list({})
      return { credentials: result.value.credentials.map(viewJson) }
    },
    presentCall: () => present('List credentials', 'read'),
  }))

  ctx.tools.register(defineTool({
    name: 'credential_create',
    description: CREATE_DESCRIPTION,
    parameters: {
      name: {
        type: 'string',
        required: true,
        description: 'Display name, for example "Acme Prod API".',
      },
      id: {
        type: 'string',
        description: 'Optional explicit handle [a-z0-9][a-z0-9-]*; derived from name when absent. '
          + 'Required when the name has no ASCII letters or digits.',
      },
      user_notes: {
        type: 'string',
        description: 'Optional note from/to the user context shown with the credential.',
      },
      expire_date: {
        type: 'string',
        description: 'Optional expiry day YYYY-MM-DD when the conversation already states one. '
          + 'Informational only: past expiry the value still injects, but list/read flag it expired.',
      },
    },
    output: CREATE_OUTPUT,
    async execute(args) {
      const manager = ctx.get('credentialManager')
      if (manager === undefined) return unavailable()
      const result = await manager.create({
        name: args.name,
        ...args.id === undefined ? {} : { id: args.id },
        ...args.user_notes === undefined ? {} : { userNotes: args.user_notes },
        ...args.expire_date === undefined ? {} : { expireDate: args.expire_date },
      })
      if (!result.ok) return failure(result.error)
      const credential: CredentialView = result.value
      return {
        credential: viewJson(credential),
        instruction: `Credential "${credential.name}" (id: ${credential.id}) was created with no `
          + 'secret value. Ask the user to enter the value in Settings → Credentials. Once '
          + `entered, it is usable in shell commands as $${credential.envVar} without the value `
          + 'entering the conversation.',
      }
    },
    presentCall: args => present('Create credential placeholder', 'other', args.name),
  }))

  ctx.tools.register(defineTool({
    name: 'credential_read',
    description: READ_DESCRIPTION,
    parameters: {
      id: { type: 'string', required: true, description: 'Exact credential id from credential_list.' },
    },
    output: READ_OUTPUT,
    async execute(args) {
      const manager = ctx.get('credentialManager')
      if (manager === undefined) return unavailable()
      const result = await manager.read(args.id)
      if (!result.ok) return failure(result.error)
      return {
        credential: viewJson(result.value.credential),
        ...result.value.value === undefined ? {} : { value: result.value.value },
      }
    },
    presentCall: args => present('Read credential (secret enters context)', 'read', args.id),
  }))

  ctx.tools.register(defineTool({
    name: 'credential_update_note',
    description: NOTE_DESCRIPTION,
    parameters: {
      id: { type: 'string', required: true, description: 'Exact credential id from credential_list.' },
      llm_notes: {
        type: 'string',
        required: true,
        description: 'Your replacement annotation; pass an empty string to clear it.',
      },
    },
    output: NOTE_OUTPUT,
    async execute(args) {
      const manager = ctx.get('credentialManager')
      if (manager === undefined) return unavailable()
      const result = await manager.updateLlmNote(args.id, args.llm_notes)
      if (!result.ok) return failure(result.error)
      return { credential: viewJson(result.value) }
    },
    presentCall: args => present('Update credential note', 'other', args.id),
  }))
}

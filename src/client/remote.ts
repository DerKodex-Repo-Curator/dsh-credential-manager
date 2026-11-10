/**
 * Client-side Typert Remote contribution for the credentialManager namespace:
 * the strict invocation descriptors `ctx.remote.$mount` installs in the
 * browser so the settings page can call the host service over the wire.
 *
 * Hand-maintained mirror of the host service's @Remote surface
 * (`src/index.ts`). The harness's Typert generator normally emits this file
 * inside the monorepo; this standalone package authors it directly instead —
 * keep it in sync when the service's Remote methods change. Descriptor
 * codecs must stay `strict` (the client rejects schema-less `src-json`).
 *
 * @module dsh-credential-manager/remote
 */
import { z } from 'zod'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'




const _deepseek_ai_dsh_credential_manager_credentialManager_create_parameter_0$schema = z.object({
  'name': z.string().readonly(),
  'id': z.string().readonly().optional(),
  'userNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_create_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'name': z.string().readonly(),
  'envVar': z.string().readonly(),
  'configured': z.boolean().readonly(),
  'writable': z.boolean().readonly(),
  'userNotes': z.string().readonly().optional(),
  'llmNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
  'expired': z.boolean().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.union([z.object({
  'code': z.literal("invalid-name").readonly(),
}), z.object({
  'code': z.literal("invalid-id").readonly(),
  'id': z.string().readonly(),
}), z.object({
  'code': z.literal("id-conflict").readonly(),
  'id': z.string().readonly(),
}), z.object({
  'code': z.literal("note-blank").readonly(),
}), z.object({
  'code': z.literal("note-too-large").readonly(),
  'maxBytes': z.number().readonly(),
  'actualBytes': z.number().readonly(),
}), z.object({
  'code': z.literal("invalid-expire-date").readonly(),
  'expireDate': z.string().readonly(),
})]).readonly(),
})])
const _deepseek_ai_dsh_credential_manager_credentialManager_delete_parameter_0$schema = z.object({
  'id': z.string().readonly(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_delete_result$schema = z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'absent': z.literal(true).readonly(),
}).readonly(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_get_parameter_0$schema = z.object({
  'id': z.string().readonly(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_get_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'name': z.string().readonly(),
  'envVar': z.string().readonly(),
  'configured': z.boolean().readonly(),
  'writable': z.boolean().readonly(),
  'userNotes': z.string().readonly().optional(),
  'llmNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
  'expired': z.boolean().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.object({
  'code': z.literal("not-found").readonly(),
  'id': z.string().readonly(),
}).readonly(),
})])
const _deepseek_ai_dsh_credential_manager_credentialManager_list_parameter_0$schema = z.object({})
const _deepseek_ai_dsh_credential_manager_credentialManager_list_result$schema = z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'credentials': z.array(z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'name': z.string().readonly(),
  'envVar': z.string().readonly(),
  'configured': z.boolean().readonly(),
  'writable': z.boolean().readonly(),
  'userNotes': z.string().readonly().optional(),
  'llmNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
  'expired': z.boolean().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
})).readonly(),
}).readonly(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_setSecret_parameter_0$schema = z.object({
  'id': z.string().readonly(),
  'value': z.string().readonly(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_setSecret_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'name': z.string().readonly(),
  'envVar': z.string().readonly(),
  'configured': z.boolean().readonly(),
  'writable': z.boolean().readonly(),
  'userNotes': z.string().readonly().optional(),
  'llmNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
  'expired': z.boolean().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.union([z.object({
  'code': z.literal("not-found").readonly(),
  'id': z.string().readonly(),
}), z.object({
  'code': z.literal("secret-blank").readonly(),
}), z.object({
  'code': z.literal("secret-rejected").readonly(),
  'message': z.string().readonly(),
})]).readonly(),
})])
const _deepseek_ai_dsh_credential_manager_credentialManager_unsetSecret_parameter_0$schema = z.object({
  'id': z.string().readonly(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_unsetSecret_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'name': z.string().readonly(),
  'envVar': z.string().readonly(),
  'configured': z.boolean().readonly(),
  'writable': z.boolean().readonly(),
  'userNotes': z.string().readonly().optional(),
  'llmNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
  'expired': z.boolean().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.union([z.object({
  'code': z.literal("not-found").readonly(),
  'id': z.string().readonly(),
}), z.object({
  'code': z.literal("secret-rejected").readonly(),
  'message': z.string().readonly(),
})]).readonly(),
})])
const _deepseek_ai_dsh_credential_manager_credentialManager_update_parameter_0$schema = z.object({
  'id': z.string().readonly(),
  'name': z.string().readonly().optional(),
  'userNotes': z.union([z.literal(null), z.string()]).readonly().optional(),
  'llmNotes': z.union([z.literal(null), z.string()]).readonly().optional(),
  'expireDate': z.union([z.literal(null), z.string()]).readonly().optional(),
})
const _deepseek_ai_dsh_credential_manager_credentialManager_update_result$schema = z.union([z.object({
  'ok': z.literal(true).readonly(),
  'value': z.object({
  'id': z.intersection(z.string(), z.unknown()).readonly(),
  'name': z.string().readonly(),
  'envVar': z.string().readonly(),
  'configured': z.boolean().readonly(),
  'writable': z.boolean().readonly(),
  'userNotes': z.string().readonly().optional(),
  'llmNotes': z.string().readonly().optional(),
  'expireDate': z.string().readonly().optional(),
  'expired': z.boolean().readonly(),
  'createdAt': z.number().readonly(),
  'updatedAt': z.number().readonly(),
}).readonly(),
}), z.object({
  'ok': z.literal(false).readonly(),
  'error': z.union([z.object({
  'code': z.literal("not-found").readonly(),
  'id': z.string().readonly(),
}), z.object({
  'code': z.literal("invalid-name").readonly(),
}), z.object({
  'code': z.literal("note-blank").readonly(),
}), z.object({
  'code': z.literal("note-too-large").readonly(),
  'maxBytes': z.number().readonly(),
  'actualBytes': z.number().readonly(),
}), z.object({
  'code': z.literal("invalid-expire-date").readonly(),
  'expireDate': z.string().readonly(),
})]).readonly(),
})])

const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-credential-manager',
  descriptors: [
    {
      id: 'dsh-credential-manager#credentialManager/create',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'create',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerCreateRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_create_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerCreateResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_create_result$schema,
      },
    },
    {
      id: 'dsh-credential-manager#credentialManager/delete',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'delete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerDeleteRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_delete_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerDeleteResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_delete_result$schema,
      },
    },
    {
      id: 'dsh-credential-manager#credentialManager/get',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'get',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerGetRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_get_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerGetResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_get_result$schema,
      },
    },
    {
      id: 'dsh-credential-manager#credentialManager/list',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: '_request',
          wire: '_request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerListRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_list_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerListResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_list_result$schema,
      },
    },
    {
      id: 'dsh-credential-manager#credentialManager/setSecret',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'setSecret',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerSetSecretRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_setSecret_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerSetSecretResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_setSecret_result$schema,
      },
    },
    {
      id: 'dsh-credential-manager#credentialManager/unsetSecret',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'unsetSecret',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerUnsetSecretRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_unsetSecret_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerUnsetSecretResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_unsetSecret_result$schema,
      },
    },
    {
      id: 'dsh-credential-manager#credentialManager/update',
      service: 'credentialManager',
      namespace: 'credentialManager',
      method: 'update',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'dsh-credential-manager/types#CredentialManagerUpdateRequest',
            create: () => _deepseek_ai_dsh_credential_manager_credentialManager_update_parameter_0$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-credential-manager/types#CredentialManagerUpdateResult',
        create: () => _deepseek_ai_dsh_credential_manager_credentialManager_update_result$schema,
      },
    },
  ],
}


export default TYPERT_REMOTE

/** `settings.credentials` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  nav: '凭据',
  intro: '保存供模型按需使用的凭据。每条凭据对应一个秘密值，模型在 shell 命令中通过列出的环境变量使用它，值不会进入对话。',
  'create.title': '新建凭据',
  'create.submit': '创建凭据',
  'field.name': 'name（名称）',
  'field.id': 'id（句柄，决定环境变量名）',
  'field.secret': 'secret（秘密值，只写不读回）',
  'field.userNotes': 'user_notes（给模型看的用户备注）',
  'field.llmNotes': 'llm_notes（LLM 留给未来的备注）',
  'field.expireDate': 'expire_date（过期日，仅提示）',
  'placeholder.name': '例如：Acme 生产环境 API',
  'placeholder.id': '缺省从名称派生，如 my-api',
  'placeholder.secret': '输入秘密值（只写不读回）',
  'placeholder.userNotes': '例如：每月轮换的生产密钥',
  'placeholder.llmNotes': 'LLM 交互后留下的备注，如「8月已轮换」',
  'list.empty': '还没有凭据。模型在对话中可以用 credential_create 创建占位凭据，由你在这里录入秘密值。',
  'row.pending': '待录入',
  'row.expired': '已过期',
  'row.save': '保存',
  'row.delete': '删除',
  'row.deleteConfirm': '确认删除？该凭据的秘密值会一并清除。',
  'row.deleteCancel': '取消',
  'secret.set': '设置',
  'secret.replace': '替换',
  'secret.clear': '清除',
  'secret.configured': '已设置',
  'secret.missing': '未设置',
  'secret.readonly': '该值当前由环境提供，此处只读',
  'error.load': '凭据列表加载失败',
  'error.invalid-name': '名称不能为空',
  'error.invalid-id': 'ID 须匹配 [a-z0-9][a-z0-9-]*（纯中文名称请显式填写 ID）',
  'error.id-conflict': '该 ID 已被占用',
  'error.secret-blank': '秘密值不能为空',
  'error.secret-rejected': '凭据存储拒绝了写入（可能被环境变量遮蔽）',
  'error.note-blank': '备注不能为空',
  'error.note-too-large': '备注过长',
  'error.invalid-expire-date': '过期日须为有效日期 YYYY-MM-DD',
  'error.not-found': '凭据不存在（可能已在别处删除）',
  'error.generic': '操作失败',
} satisfies Record<string, string>

/** The credentials settings namespace key union. */
export type CredentialsKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Credentials settings page copy. */
    'settings.credentials': CredentialsKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  nav: 'Credentials',
  intro: 'Save credentials the model uses on demand. Each credential holds exactly one secret value; the model uses it through the listed environment variable in shell commands, so the value never enters the conversation.',
  'create.title': 'New credential',
  'create.submit': 'Create credential',
  'field.name': 'name (display name)',
  'field.id': 'id (handle, names the env var)',
  'field.secret': 'secret (write-only value)',
  'field.userNotes': 'user_notes (note for the model)',
  'field.llmNotes': 'llm_notes (the model\'s note to its future self)',
  'field.expireDate': 'expire_date (informational only)',
  'placeholder.name': 'For example: Acme Prod API',
  'placeholder.id': 'Derived from the name when omitted, e.g. my-api',
  'placeholder.secret': 'Enter the secret value (write-only)',
  'placeholder.userNotes': 'For example: production key, rotated monthly',
  'placeholder.llmNotes': 'Notes the LLM left after use, e.g. "rotated in August"',
  'list.empty': 'No credentials yet. The model can open a placeholder with credential_create during a conversation; you enter the secret value here.',
  'row.pending': 'Needs entry',
  'row.expired': 'Expired',
  'row.save': 'Save',
  'row.delete': 'Delete',
  'row.deleteConfirm': 'Delete this credential? Its stored secret value is removed with it.',
  'row.deleteCancel': 'Cancel',
  'secret.set': 'Set',
  'secret.replace': 'Replace',
  'secret.clear': 'Clear',
  'secret.configured': 'Set',
  'secret.missing': 'Not set',
  'secret.readonly': 'Currently supplied by the environment; read-only here',
  'error.load': 'Could not load credentials',
  'error.invalid-name': 'The name must not be blank',
  'error.invalid-id': 'The ID must match [a-z0-9][a-z0-9-]* (set one explicitly for non-ASCII names)',
  'error.id-conflict': 'That ID is already taken',
  'error.secret-blank': 'The secret value must not be empty',
  'error.secret-rejected': 'The credential store rejected the write (possibly shadowed by the environment)',
  'error.note-blank': 'The note must not be blank',
  'error.note-too-large': 'The note is too long',
  'error.invalid-expire-date': 'The expiry day must be a valid YYYY-MM-DD date',
  'error.not-found': 'The credential no longer exists (deleted elsewhere?)',
  'error.generic': 'Operation failed',
} satisfies Record<CredentialsKey, string>

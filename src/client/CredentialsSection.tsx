/**
 * Credentials settings section: one flat card per credential with labeled
 * fields (name, id, secret, user_notes, llm_notes, expire_date). Secret
 * values are write-only — the page never displays one — and each card shows
 * the DSH_CM_<ID> variable the model uses in shell commands. The page is the
 * user's entry point for the placeholders the model's credential_create opens.
 * @module dsh-credential-manager/client/CredentialsSection
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { CredentialView } from '../types.ts'
import type { CredentialsSettingsState, CredentialsSettingsStore } from './store.ts'
import type { en } from './locales.ts'
import styles from './CredentialsSection.module.css'

/** Injected dependencies of {@link CredentialsSection} (slot `inject`). */
export interface CredentialsSectionInjected {
  /** The page store (loaded on mount, refreshed on pushed invalidations). */
  controller: CredentialsSettingsStore
  /** uSES subscription hook bound to the store. */
  useSnapshot: SnapshotSelectorHook<CredentialsSettingsState>
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the inject face spread flat (the
 * renderer erases the share boundary at the render call).
 */
export type CredentialsSectionProps = Partial<CredentialsSectionInjected>

type Translate = CredentialsSectionInjected['t']

/** Map one business failure code onto its localized line. */
function errorLine(t: Translate, code: string): string {
  const key = `error.${code}` as keyof typeof en
  const line = t(key)
  return line === key ? t('error.generic') : line
}

/** One labeled form row: the item name sits OUTSIDE the box. */
function Field(props: { label: string; children: ReactNode }): ReactNode {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{props.label}</span>
      <span className={styles.fieldBody}>{props.children}</span>
    </label>
  )
}

/** One editable text field with a save button that appears while dirty. */
function EditableText(props: {
  label: string
  value: string
  placeholder?: string
  type?: string
  onSave: (next: string) => Promise<void>
  t: Translate
}): ReactNode {
  const { label, value, placeholder, type, onSave, t } = props
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  // An external update (another tab, the model's note) reseeds a clean draft.
  useEffect(() => { setDraft(value) }, [value])

  const dirty = draft !== value
  const save = async (): Promise<void> => {
    if (!dirty || busy) return
    setBusy(true)
    await onSave(draft)
    setBusy(false)
  }

  return (
    <Field label={label}>
      <input
        className={styles.input}
        type={type ?? 'text'}
        value={draft}
        placeholder={placeholder}
        onChange={event => setDraft(event.currentTarget.value)}
      />
      {dirty && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
          {t('row.save')}
        </Button>
      )}
    </Field>
  )
}

/** One credential card: every labeled field of the flat record. */
function CredentialCard(props: {
  credential: CredentialView
  t: Translate
  controller: CredentialsSettingsStore
}): ReactNode {
  const { credential, t, controller } = props
  const [secretDraft, setSecretDraft] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const run = async (action: () => Promise<{ ok: boolean } & { code?: string }>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) setActionError(result.code ?? 'generic')
    else setActionError(null)
    return result.ok
  }

  const saveSecret = async (): Promise<void> => {
    if (secretDraft.length === 0) return
    const ok = await run(() => controller.setSecret(credential.id, secretDraft))
    if (ok) setSecretDraft('')
  }
  const clearSecret = (): void => { void run(() => controller.unsetSecret(credential.id)) }
  const remove = async (): Promise<void> => {
    const ok = await run(() => controller.remove(credential.id))
    if (ok) setConfirming(false)
  }

  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        {!credential.configured && <Pill>{t('row.pending')}</Pill>}
        {credential.expired && <Pill>{t('row.expired')}</Pill>}
        <span className={styles.spacer} />
        {confirming
          ? (
            <>
              <span className={styles.confirmText}>{t('row.deleteConfirm')}</span>
              <Button size="sm" variant="primary" onClick={() => void remove()}>{t('row.delete')}</Button>
              <Button size="sm" onClick={() => setConfirming(false)}>{t('row.deleteCancel')}</Button>
            </>
          )
          : <Button size="sm" onClick={() => setConfirming(true)}>{t('row.delete')}</Button>}
      </header>

      <EditableText
        label={t('field.name')}
        value={credential.name}
        placeholder={t('placeholder.name')}
        t={t}
        onSave={async next => { await run(() => controller.update({ id: credential.id, name: next })) }}
      />

      <Field label={t('field.id')}>
        <code className={styles.staticCode}>{credential.id}</code>
        <code className={styles.envVar}>{credential.envVar}</code>
      </Field>

      <Field label={t('field.secret')}>
        <span
          className={credential.configured ? styles.dotConfigured : styles.dotMissing}
          title={credential.configured ? t('secret.configured') : t('secret.missing')}
        />
        {credential.writable
          ? (
            <>
              <input
                className={styles.input}
                type="password"
                autoComplete="off"
                placeholder={t('placeholder.secret')}
                value={secretDraft}
                onChange={event => setSecretDraft(event.currentTarget.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={secretDraft.length === 0 || busy}
                onClick={() => void saveSecret()}
              >
                {credential.configured ? t('secret.replace') : t('secret.set')}
              </Button>
              {credential.configured && (
                <Button size="sm" disabled={busy} onClick={clearSecret}>
                  {t('secret.clear')}
                </Button>
              )}
            </>
          )
          : <span className={styles.readonlyHint}>{t('secret.readonly')}</span>}
      </Field>

      <EditableText
        label={t('field.userNotes')}
        value={credential.userNotes ?? ''}
        placeholder={t('placeholder.userNotes')}
        t={t}
        onSave={async next => {
          await run(() => controller.update({
            id: credential.id,
            userNotes: next.trim().length === 0 ? null : next,
          }))
        }}
      />

      <EditableText
        label={t('field.llmNotes')}
        value={credential.llmNotes ?? ''}
        placeholder={t('placeholder.llmNotes')}
        t={t}
        onSave={async next => {
          await run(() => controller.update({
            id: credential.id,
            llmNotes: next.trim().length === 0 ? null : next,
          }))
        }}
      />

      <EditableText
        label={t('field.expireDate')}
        value={credential.expireDate ?? ''}
        type="date"
        t={t}
        onSave={async next => {
          await run(() => controller.update({
            id: credential.id,
            expireDate: next.trim().length === 0 ? null : next,
          }))
        }}
      />

      {actionError !== null && <div className={styles.errorLine}>{errorLine(t, actionError)}</div>}
    </section>
  )
}

/** The create form at the top of the page; every field carries its label. */
function CreateCard(props: { t: Translate; controller: CredentialsSettingsStore }): ReactNode {
  const { t, controller } = props
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  const [userNotes, setUserNotes] = useState('')
  const [expireDate, setExpireDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (name.trim().length === 0 || busy) return
    setBusy(true)
    const result = await controller.create({
      name,
      ...id.trim().length === 0 ? {} : { id: id.trim() },
      ...userNotes.trim().length === 0 ? {} : { userNotes },
      ...expireDate.length === 0 ? {} : { expireDate },
      ...secret.length === 0 ? {} : { secret },
    })
    setBusy(false)
    if (result.ok) {
      setName('')
      setId('')
      setSecret('')
      setUserNotes('')
      setExpireDate('')
      setActionError(null)
    } else setActionError(result.code)
  }

  return (
    <section className={styles.card}>
      <div className={styles.createTitle}>{t('create.title')}</div>
      <Field label={t('field.name')}>
        <input className={styles.input} placeholder={t('placeholder.name')} value={name}
          onChange={event => setName(event.currentTarget.value)} />
      </Field>
      <Field label={t('field.id')}>
        <input className={styles.input} placeholder={t('placeholder.id')} value={id}
          onChange={event => setId(event.currentTarget.value)} />
      </Field>
      <Field label={t('field.secret')}>
        <input className={styles.input} type="password" autoComplete="off"
          placeholder={t('placeholder.secret')} value={secret}
          onChange={event => setSecret(event.currentTarget.value)} />
      </Field>
      <Field label={t('field.userNotes')}>
        <input className={styles.input} placeholder={t('placeholder.userNotes')} value={userNotes}
          onChange={event => setUserNotes(event.currentTarget.value)} />
      </Field>
      <Field label={t('field.expireDate')}>
        <input className={styles.input} type="date" value={expireDate}
          onChange={event => setExpireDate(event.currentTarget.value)} />
      </Field>
      <div className={styles.createActions}>
        <Button variant="primary" disabled={name.trim().length === 0 || busy} onClick={() => void submit()}>
          {t('create.submit')}
        </Button>
      </div>
      {actionError !== null && <div className={styles.errorLine}>{errorLine(t, actionError)}</div>}
    </section>
  )
}

/**
 * The Credentials settings page body.
 * @param props - injected controller, snapshot hook, and copy.
 */
export function CredentialsSection(props: CredentialsSectionProps): ReactNode {
  const { controller, useSnapshot, t } = props
  const state = useSnapshot?.(snapshot => snapshot)

  useEffect(() => {
    if (controller !== undefined) void controller.load()
  }, [controller])

  if (controller === undefined || useSnapshot === undefined || t === undefined || state === undefined) {
    return null
  }

  return (
    <div className={styles.page}>
      <p className={styles.intro}>{t('intro')}</p>
      <CreateCard t={t} controller={controller} />
      {state.status === 'error' && (
        <div className={styles.errorLine}>{t('error.load')}</div>
      )}
      {state.status === 'ready' && state.credentials.length === 0 && (
        <p className={styles.empty}>{t('list.empty')}</p>
      )}
      {state.credentials.map(credential => (
        <CredentialCard
          key={credential.id}
          credential={credential}
          t={t}
          controller={controller}
        />
      ))}
    </div>
  )
}

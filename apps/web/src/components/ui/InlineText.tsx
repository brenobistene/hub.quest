import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * Notion-style inline editing: click to edit, Enter to commit, Escape to
 * cancel, blur to commit. Whitespace-only input is ignored by default.
 * Empty value shows a subtle `—` placeholder.
 *
 * Props:
 *  - allowEmpty: aceita string vazia no commit. Útil quando consumidor
 *    quer "limpar título" → backend normaliza pra default (ex: page title
 *    com vazio → "Sem título"). Sem isso, draft vazio é descartado e
 *    o valor original volta.
 *  - autoEdit: inicia o componente em modo edit, com cursor já no input
 *    e texto selecionado. Usado em "criar page" → abre direto pra digitar
 *    o título.
 */
export function InlineText({ value, onSave, style, allowEmpty, autoEdit, placeholder }: {
  value: string
  onSave: (v: string) => void
  style?: CSSProperties
  allowEmpty?: boolean
  autoEdit?: boolean
  /** Placeholder usado quando value vazio (sobrescreve o "—" default). */
  placeholder?: string
}) {
  const [editing, setEditing] = useState(autoEdit ?? false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  // autoEdit é "fire once" — quando consumidor flipa pra true, abre em edit.
  // Quando flipa de volta, mantém o que tava (não fecha forçado).
  useEffect(() => {
    if (autoEdit) setEditing(true)
  }, [autoEdit])

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (allowEmpty) {
      if (draft !== value) onSave(trimmed)
      else setDraft(value)
      return
    }
    if (trimmed && draft !== value) onSave(trimmed)
    else setDraft(value)
  }

  if (editing) return (
    <input
      ref={ref} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      style={{
        background: 'rgba(8, 12, 18, 0.45)', border: 'none',
        borderBottom: '1px solid var(--color-ice)',
        color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit',
        outline: 'none', width: '100%', padding: '2px 4px',
        boxShadow: '0 1px 6px rgba(143, 191, 211, 0.20)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        ...style,
      }}
    />
  )

  return (
    <span
      onClick={() => setEditing(true)}
      style={{ cursor: 'text', ...style }}
      title="clicar pra editar"
    >
      {value || (
        <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', opacity: 0.6 }}>
          {placeholder ?? '—'}
        </span>
      )}
    </span>
  )
}

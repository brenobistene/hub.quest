import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * Notion-style inline editing: click to edit, Enter to commit, Escape to
 * cancel, blur to commit. Whitespace-only input is ignored. Empty value
 * shows a subtle `—` placeholder.
 */
export function InlineText({ value, onSave, style }: {
  value: string
  onSave: (v: string) => void
  style?: CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    setEditing(false)
    if (draft.trim() && draft !== value) onSave(draft.trim())
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
      {value || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', opacity: 0.6 }}>—</span>}
    </span>
  )
}

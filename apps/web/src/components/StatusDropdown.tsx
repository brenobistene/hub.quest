import { useEffect, useRef, useState } from 'react'
import { STATUSES } from '../utils/quests'

/**
 * Inline status picker used in the QuestDetailPanel. Shows current status
 * as a dashed-underlined label that opens a dropdown on click. Closes on
 * outside click.
 */
export function StatusDropdown({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.15em', cursor: 'pointer', userSelect: 'none',
          borderBottom: '1px dashed var(--color-border)', paddingBottom: 1,
        }}
      >
        {STATUSES.find(s => s.key === status)?.label ?? status}
      </span>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 6,
          background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          zIndex: 100, minWidth: 110, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {STATUSES.map(s => (
            <div
              key={s.key}
              onClick={() => { onChange(s.key); setOpen(false) }}
              style={{
                padding: '9px 14px', fontSize: 12, cursor: 'pointer',
                color: s.key === status ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: s.key === status ? 'var(--color-border)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = s.key === status ? 'var(--color-text-primary)' : 'var(--color-text-secondary)')}
            >
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

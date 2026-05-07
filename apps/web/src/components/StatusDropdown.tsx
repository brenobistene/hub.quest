import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STATUSES } from '../utils/quests'

/**
 * Inline status picker used in the QuestDetailPanel. Shows current status
 * as a dashed-underlined label that opens a dropdown on click. Closes on
 * outside click.
 */
export function StatusDropdown({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    function place() {
      if (!triggerRef.current) return
      const r = triggerRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      const target = e.target as Node
      if (popoverRef.current && popoverRef.current.contains(target)) return
      if (triggerRef.current && triggerRef.current.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <>
      <span
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 700,
          color: 'var(--color-ice-light)',
          textTransform: 'uppercase',
          letterSpacing: '0.22em',
          cursor: 'pointer', userSelect: 'none',
          background: 'rgba(8, 12, 18, 0.55)',
          border: '1px solid var(--color-border)',
          borderRadius: 0,
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
          padding: '5px 10px',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
          e.currentTarget.style.boxShadow = '0 0 8px rgba(143, 191, 211, 0.20)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {(STATUSES.find(s => s.key === status)?.label ?? status).toUpperCase()}
        <span style={{ color: 'var(--color-text-muted)', fontSize: 8, marginLeft: 2 }}>▾</span>
      </span>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="hq-animate-fade-up"
          style={{
            position: 'fixed', top: pos.top, right: pos.right,
            zIndex: 10000, minWidth: 140,
            background: 'rgba(8, 12, 18, 0.96)',
            border: '1px solid rgba(143, 191, 211, 0.45)',
            borderRadius: 0,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
            boxShadow: '0 0 24px rgba(143, 191, 211, 0.20), 0 8px 28px rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            padding: 4,
          }}
        >
          {STATUSES.map(s => {
            const active = s.key === status
            return (
              <div
                key={s.key}
                onClick={() => { onChange(s.key); setOpen(false) }}
                style={{
                  padding: '7px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.22em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  color: active ? 'var(--color-ice-light)' : 'var(--color-text-secondary)',
                  background: active ? 'rgba(143, 191, 211, 0.10)' : 'transparent',
                  borderLeft: active ? '2px solid var(--color-ice-light)' : '2px solid transparent',
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(143, 191, 211, 0.12)'
                  e.currentTarget.style.color = 'var(--color-ice-light)'
                  e.currentTarget.style.borderLeftColor = 'var(--color-ice-light)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = active ? 'rgba(143, 191, 211, 0.10)' : 'transparent'
                  e.currentTarget.style.color = active ? 'var(--color-ice-light)' : 'var(--color-text-secondary)'
                  e.currentTarget.style.borderLeftColor = active ? 'var(--color-ice-light)' : 'transparent'
                }}
              >
                {s.label.toUpperCase()}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

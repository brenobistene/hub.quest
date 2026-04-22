import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import type { DatePreset, DateRange } from '../utils/dateRange'
import { DATE_PRESET_LABELS, computeRange, rangeLabel } from '../utils/dateRange'

/**
 * Notion-style date range dropdown used to filter:
 *  - Quests/tasks/rotinas concluídas
 *  - "Rotinas cumpridas" stats no Dashboard
 *  - Planejador do Dia (filtro de data)
 *
 * Presets + custom (`de ... até ...`). Closes on outside click.
 */
export function DateRangeFilter({ value, onChange }: {
  value: DateRange
  onChange: (r: DateRange) => void
}) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.customFrom ?? '')
  const [customTo, setCustomTo] = useState(value.customTo ?? '')
  const [showingCustom, setShowingCustom] = useState(value.preset === 'custom')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const presets: DatePreset[] = ['today', '7d', '30d', 'all', 'custom']

  function applyCustom() {
    if (!customFrom || !customTo) return
    onChange(computeRange('custom', customFrom, customTo))
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
          color: 'var(--color-text-tertiary)', fontSize: 10,
          padding: '4px 8px', borderRadius: 3,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit',
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--color-text-secondary)'
          e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--color-text-tertiary)'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
      >
        {rangeLabel(value)}
        <ChevronDown size={10} strokeWidth={2} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 3, padding: '4px 0',
          zIndex: 100, minWidth: 200,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        }}>
          {presets.map(p => (
            <button
              key={p}
              onClick={() => {
                if (p === 'custom') { setShowingCustom(true); return }
                setShowingCustom(false)
                onChange(computeRange(p))
                setOpen(false)
              }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: p === value.preset ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                fontSize: 11, padding: '7px 12px',
                width: '100%', textAlign: 'left',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 12, display: 'inline-flex', justifyContent: 'center' }}>
                {p === value.preset && <Check size={10} strokeWidth={2.5} />}
              </span>
              {DATE_PRESET_LABELS[p]}
            </button>
          ))}
          {showingCustom && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 28 }}>de</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  style={{
                    flex: 1, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)', fontSize: 11, padding: '4px 6px', borderRadius: 3,
                    outline: 'none', colorScheme: 'dark',
                  } as any}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', width: 28 }}>até</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  style={{
                    flex: 1, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)', fontSize: 11, padding: '4px 6px', borderRadius: 3,
                    outline: 'none', colorScheme: 'dark',
                  } as any}
                />
              </div>
              <button
                onClick={applyCustom}
                disabled={!customFrom || !customTo}
                style={{
                  background: customFrom && customTo ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                  color: customFrom && customTo ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                  border: 'none', cursor: customFrom && customTo ? 'pointer' : 'not-allowed',
                  fontSize: 10, padding: '6px', borderRadius: 3,
                  fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

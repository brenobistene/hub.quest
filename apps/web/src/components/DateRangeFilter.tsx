import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * O dropdown é renderizado via `createPortal` no `document.body` pra escapar
 * de ancestrais com `overflow: hidden` ou stacking contexts (ex: dentro de
 * PageShell/BodyAtmosphere). Posiciona via `position: fixed` com bounding
 * rect do botão computado em runtime.
 */
export function DateRangeFilter({ value, onChange }: {
  value: DateRange
  onChange: (r: DateRange) => void
}) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.customFrom ?? '')
  const [customTo, setCustomTo] = useState(value.customTo ?? '')
  const [showingCustom, setShowingCustom] = useState(value.preset === 'custom')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Posiciona popover logo abaixo do botão. Recomputa em scroll/resize pra
  // acompanhar o anchor se a página rolar enquanto aberto.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    function place() {
      if (!buttonRef.current) return
      const r = buttonRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Outside-click fecha. Considera tanto o popover (no body) quanto o botão
  // (no fluxo normal) como áreas "seguras" — clique no botão deve toggle,
  // não fechar e reabrir.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (popoverRef.current && popoverRef.current.contains(target)) return
      if (buttonRef.current && buttonRef.current.contains(target)) return
      setOpen(false)
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
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
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
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="hq-animate-fade-up"
          style={{
            // Portal-ado pra escapar de overflow:hidden de ancestrais
            // (BodyAtmosphere do PageShell). Position fixed com offset
            // computado pelo bounding rect do botão.
            position: 'fixed', top: pos.top, left: pos.left,
            padding: 'var(--space-1) 0',
            zIndex: 10000, minWidth: 200,
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            // Hairline oxblood sutil no topo — assinatura do design system.
            backgroundImage: 'linear-gradient(180deg, rgba(159, 18, 57, 0.06), transparent 32px)',
          }}
        >
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
                color: p === value.preset ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 12, padding: '9px 14px',
                width: '100%', textAlign: 'left',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                fontWeight: p === value.preset ? 600 : 400,
                transition: 'background var(--motion-fast) var(--ease-smooth), color var(--motion-fast) var(--ease-smooth)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--glass-bg-hover)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = p === value.preset ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
              }}
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
                  autoComplete="off"
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
                  autoComplete="off"
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
        </div>,
        document.body,
      )}
    </div>
  )
}

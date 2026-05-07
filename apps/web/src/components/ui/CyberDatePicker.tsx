import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES_PT = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
]
const WEEKDAY_HEADER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Date picker cyberpunk com popover portal-ado. Substitui `<input type="date">`
 * pra escapar do dropdown nativo do browser (que não é estilável via CSS).
 *
 * Visual: input chamferado ice + ícone calendário; popover com grid 7×6 do mês,
 * navegação prev/next, hoje destacado, dia selecionado com glow ice.
 *
 * Value/onChange usam string `YYYY-MM-DD` (mesma API do input nativo) — drop-in
 * replacement nos call sites existentes.
 */
export function CyberDatePicker({ value, onChange, placeholder, width }: {
  value: string  // YYYY-MM-DD or ''
  onChange: (v: string) => void
  placeholder?: string
  width?: number | string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Mês atualmente exibido no grid. Inicializa no mês do value (ou hoje).
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      return { year: y, month: m - 1 }
    }
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  // Quando o value muda externamente, sincroniza o mês exibido.
  useEffect(() => {
    if (!value) return
    const [y, m] = value.split('-').map(Number)
    setViewMonth({ year: y, month: m - 1 })
  }, [value])

  // Posiciona popover via fixed coords do trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    function place() {
      if (!triggerRef.current) return
      const r = triggerRef.current.getBoundingClientRect()
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

  // Outside-click fecha. Esc fecha.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (popoverRef.current && popoverRef.current.contains(target)) return
      if (triggerRef.current && triggerRef.current.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Calcula o grid 7×6 do mês exibido. Inclui dias do mês anterior/posterior
  // pra preencher a primeira/última semana — ficam dim com flag `outside`.
  const days = useMemo(() => {
    const { year, month } = viewMonth
    const firstOfMonth = new Date(year, month, 1)
    const startWeekday = firstOfMonth.getDay() // 0=Dom
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrev = new Date(year, month, 0).getDate()

    const cells: { y: number; m: number; d: number; outside: boolean }[] = []
    // Padding antes (mês anterior)
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = daysInPrev - i
      const prevMonth = month === 0 ? 11 : month - 1
      const prevYear = month === 0 ? year - 1 : year
      cells.push({ y: prevYear, m: prevMonth, d, outside: true })
    }
    // Mês atual
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ y: year, m: month, d, outside: false })
    }
    // Padding depois (mês posterior) até completar 6 semanas (42 cells).
    let nextDay = 1
    while (cells.length < 42) {
      const nextMonth = month === 11 ? 0 : month + 1
      const nextYear = month === 11 ? year + 1 : year
      cells.push({ y: nextYear, m: nextMonth, d: nextDay++, outside: true })
    }
    return cells
  }, [viewMonth])

  const today = useMemo(() => {
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }
  }, [])

  const selected = useMemo(() => {
    if (!value) return null
    const [y, m, d] = value.split('-').map(Number)
    return { y, m: m - 1, d }
  }, [value])

  function ymdToValue(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function formatDisplay(v: string): string {
    if (!v) return ''
    const [y, m, d] = v.split('-')
    return `${d}/${m}/${y.slice(-2)}`
  }

  function navigateMonth(delta: number) {
    setViewMonth(prev => {
      let m = prev.month + delta
      let y = prev.year
      if (m < 0) { m = 11; y -= 1 }
      if (m > 11) { m = 0; y += 1 }
      return { year: y, month: m }
    })
  }

  function selectToday() {
    onChange(ymdToValue(today.y, today.m, today.d))
    setOpen(false)
  }

  function clearDate() {
    onChange('')
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: width ?? '100%',
          background: 'rgba(8, 12, 18, 0.55)',
          border: '1px solid var(--color-border)',
          color: value ? 'var(--color-ice-light)' : 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: 11, padding: '5px 9px',
          letterSpacing: '0.05em',
          outline: 'none',
          cursor: 'pointer',
          borderRadius: 0,
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
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
        <CalendarIcon size={11} strokeWidth={1.8} style={{ color: 'var(--color-ice)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {value ? formatDisplay(value) : (placeholder ?? 'DD/MM/AA')}
        </span>
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="hq-animate-fade-up"
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            zIndex: 10000, minWidth: 240,
            background: 'rgba(8, 12, 18, 0.96)',
            border: '1px solid rgba(143, 191, 211, 0.45)',
            borderRadius: 0,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
            boxShadow: '0 0 24px rgba(143, 191, 211, 0.20), 0 8px 28px rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            padding: 10,
          }}
        >
          {/* Header: prev / month-year / next */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8, paddingBottom: 8,
            borderBottom: '1px solid var(--color-ice-deep)',
          }}>
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              style={navBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.18)'
              }}
            >
              <ChevronLeft size={12} strokeWidth={2} />
            </button>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11, fontWeight: 700,
              color: 'var(--color-ice-light)',
              letterSpacing: '0.22em', textTransform: 'uppercase',
            }}>
              <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
              {MONTH_NAMES_PT[viewMonth.month]} · {viewMonth.year}
            </span>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              style={navBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.18)'
              }}
            >
              <ChevronRight size={12} strokeWidth={2} />
            </button>
          </div>
          {/* Weekday header (D S T Q Q S S) */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2,
            marginBottom: 4,
          }}>
            {WEEKDAY_HEADER.map((w, i) => (
              <div
                key={i}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.18em',
                  textAlign: 'center',
                  padding: '4px 0',
                }}
              >
                {w}
              </div>
            ))}
          </div>
          {/* Day grid 7×6 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2,
          }}>
            {days.map((cell, i) => {
              const isToday = cell.y === today.y && cell.m === today.m && cell.d === today.d
              const isSelected = selected && cell.y === selected.y && cell.m === selected.m && cell.d === selected.d
              const baseColor = cell.outside
                ? 'var(--color-text-muted)'
                : isSelected
                  ? 'var(--color-ice-light)'
                  : 'var(--color-text-secondary)'
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(ymdToValue(cell.y, cell.m, cell.d))
                    setOpen(false)
                  }}
                  style={{
                    background: isSelected
                      ? 'rgba(143, 191, 211, 0.20)'
                      : 'transparent',
                    border: isToday && !isSelected
                      ? '1px solid var(--color-ice)'
                      : isSelected
                        ? '1px solid var(--color-ice-light)'
                        : '1px solid transparent',
                    color: baseColor,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10, fontWeight: 700,
                    padding: '6px 0',
                    cursor: 'pointer',
                    borderRadius: 0,
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
                    boxShadow: isSelected
                      ? '0 0 8px rgba(143, 191, 211, 0.40), inset 0 0 4px rgba(143, 191, 211, 0.20)'
                      : isToday
                        ? '0 0 6px rgba(143, 191, 211, 0.25)'
                        : 'none',
                    opacity: cell.outside ? 0.35 : 1,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    if (isSelected) return
                    e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
                    e.currentTarget.style.color = 'var(--color-ice-light)'
                    e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                  }}
                  onMouseLeave={e => {
                    if (isSelected) return
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = baseColor
                    e.currentTarget.style.borderColor = isToday ? 'var(--color-ice)' : 'transparent'
                  }}
                >
                  {cell.d}
                </button>
              )
            })}
          </div>
          {/* Footer: shortcuts */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 6,
            marginTop: 10, paddingTop: 8,
            borderTop: '1px solid var(--color-ice-deep)',
          }}>
            <button
              type="button"
              onClick={selectToday}
              style={shortcutBtnStyle}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.background = 'rgba(8, 12, 18, 0.55)'
              }}
            >
              HOJE
            </button>
            {value && (
              <button
                type="button"
                onClick={clearDate}
                style={shortcutBtnStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--color-accent-light)'
                  e.currentTarget.style.borderColor = 'rgba(159, 18, 57, 0.45)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                ✕ LIMPAR
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'rgba(143, 191, 211, 0.06)',
  border: '1px solid rgba(143, 191, 211, 0.18)',
  color: 'var(--color-text-tertiary)',
  cursor: 'pointer',
  padding: '4px 6px',
  borderRadius: 0,
  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
}

const shortcutBtnStyle: React.CSSProperties = {
  background: 'rgba(8, 12, 18, 0.55)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-tertiary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 9, fontWeight: 700,
  padding: '4px 10px',
  letterSpacing: '0.22em', textTransform: 'uppercase',
  borderRadius: 0,
  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
  transition: 'all 0.15s',
}

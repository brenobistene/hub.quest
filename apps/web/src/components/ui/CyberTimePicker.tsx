import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'

/**
 * Time picker cyberpunk com popover portal-ado. Substitui `<input type="time">`
 * pra escapar do dropdown nativo do browser.
 *
 * Visual: input chamferado ice + ícone clock; popover com 2 colunas
 * scrollables (HH 0-23 + MM 0-59 stepping 5). Selecionada com glow ice.
 *
 * Value/onChange usam string `HH:MM` (24h).
 */
export function CyberTimePicker({ value, onChange, placeholder, width, minuteStep = 5 }: {
  value: string  // HH:MM ou ''
  onChange: (v: string) => void
  placeholder?: string
  width?: number | string
  /** Step dos minutos no scroll (default 5) — UX padrão pra agendamento. */
  minuteStep?: number
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const hourColRef = useRef<HTMLDivElement>(null)
  const minuteColRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const [hour, minute] = (() => {
    if (!value) return [null, null] as [number | null, number | null]
    const [h, m] = value.split(':').map(Number)
    return [isNaN(h) ? null : h, isNaN(m) ? null : m]
  })()

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)

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

  // Auto-scroll pra hora/minuto selecionado quando popover abre.
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      if (hourColRef.current && hour != null) {
        const target = hourColRef.current.querySelector(`[data-hour="${hour}"]`) as HTMLElement | null
        if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
      }
      if (minuteColRef.current && minute != null) {
        // Encontra o minuto mais próximo do step
        const closest = minutes.reduce((a, b) => Math.abs(b - minute) < Math.abs(a - minute) ? b : a, minutes[0])
        const target = minuteColRef.current.querySelector(`[data-minute="${closest}"]`) as HTMLElement | null
        if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
      }
    })
  }, [open, hour, minute])

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

  function selectHour(h: number) {
    const m = minute ?? 0
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  function selectMinute(m: number) {
    const h = hour ?? 0
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  function clearTime() {
    onChange('')
    setOpen(false)
  }
  function setNow() {
    const d = new Date()
    const h = d.getHours()
    // Snap pro step mais próximo
    const m = Math.round(d.getMinutes() / minuteStep) * minuteStep
    onChange(`${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
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
        <Clock size={11} strokeWidth={1.8} style={{ color: 'var(--color-ice)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {value || (placeholder ?? '--:--')}
        </span>
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="hq-animate-fade-up"
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            zIndex: 10000, minWidth: 160,
            background: 'rgba(8, 12, 18, 0.96)',
            border: '1px solid rgba(143, 191, 211, 0.45)',
            borderRadius: 0,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
            boxShadow: '0 0 24px rgba(143, 191, 211, 0.20), 0 8px 28px rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            padding: 10,
          }}
        >
          {/* Header label */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, fontWeight: 700,
            color: 'var(--color-ice-light)',
            letterSpacing: '0.22em', textTransform: 'uppercase',
            marginBottom: 8, paddingBottom: 6,
            borderBottom: '1px solid var(--color-ice-deep)',
            textAlign: 'center',
          }}>
            <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
            TIME
          </div>
          {/* 2 cols: HH | MM */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <ColumnList
              ref={hourColRef}
              items={hours.map(h => ({ value: h, label: String(h).padStart(2, '0'), dataAttr: 'data-hour' }))}
              selected={hour}
              onSelect={selectHour}
              label="HH"
            />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14, fontWeight: 700,
              color: 'var(--color-ice)',
              display: 'flex', alignItems: 'center',
              padding: '0 2px',
            }}>:</div>
            <ColumnList
              ref={minuteColRef}
              items={minutes.map(m => ({ value: m, label: String(m).padStart(2, '0'), dataAttr: 'data-minute' }))}
              selected={minute}
              onSelect={selectMinute}
              label="MM"
            />
          </div>
          {/* Footer: shortcuts */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 6,
            marginTop: 10, paddingTop: 8,
            borderTop: '1px solid var(--color-ice-deep)',
          }}>
            <button
              type="button"
              onClick={setNow}
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
              AGORA
            </button>
            {value && (
              <button
                type="button"
                onClick={clearTime}
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

/** Coluna scrollable com items. Usada pra HH e MM. */
type ColumnListProps = {
  items: { value: number; label: string; dataAttr: 'data-hour' | 'data-minute' }[]
  selected: number | null
  onSelect: (v: number) => void
  label: string
}

const ColumnList = forwardRef<HTMLDivElement, ColumnListProps>(function ColumnList(
  { items, selected, onSelect, label },
  ref,
) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, fontWeight: 700,
        color: 'var(--color-text-muted)',
        letterSpacing: '0.22em',
        textAlign: 'center',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div
        ref={ref}
        style={{
          height: 160,
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(143, 191, 211, 0.18)',
          display: 'flex', flexDirection: 'column', gap: 1,
          padding: 2,
        }}
      >
        {items.map(item => {
          const isActive = selected === item.value
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect(item.value)}
              {...{ [item.dataAttr]: item.value }}
              style={{
                background: isActive ? 'rgba(143, 191, 211, 0.20)' : 'transparent',
                border: isActive ? '1px solid var(--color-ice-light)' : '1px solid transparent',
                color: isActive ? 'var(--color-ice-light)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11, fontWeight: 700,
                padding: '5px 0',
                cursor: 'pointer',
                borderRadius: 0,
                textAlign: 'center',
                flexShrink: 0,
                boxShadow: isActive ? '0 0 6px rgba(143, 191, 211, 0.30)' : 'none',
                transition: 'all 0.10s',
              }}
              onMouseEnter={e => {
                if (isActive) return
                e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
                e.currentTarget.style.color = 'var(--color-ice-light)'
              }}
              onMouseLeave={e => {
                if (isActive) return
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
})

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

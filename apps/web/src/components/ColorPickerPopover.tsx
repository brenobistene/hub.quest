import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Palette de 12 cores pras áreas. Intencionalmente em hex literal e não CSS
// vars — estes valores são **persistidos** no banco (em `area.color`) e devem
// sobreviver a mudanças de tema sem "pular" pra uma cor diferente.
export const AREA_COLOR_PALETTE = [
  '#e85d3a', '#c46a5a', '#f5a962', '#9d7a4a',
  '#7fb069', '#5a7a6a', '#7a9a8a', '#4a9eff',
  '#4a5566', '#9d6cff', '#b97a9a', '#6b7280',
]

/**
 * Popover cyber com paleta de 12 swatches + input `#rrggbb` para cor custom.
 *
 * Renderizado via createPortal no document.body — evita ser cortado por
 * `clip-path` ou ficar atrás de outros elementos por stacking context de
 * ancestrais (ex: cards das áreas com clipPath chamferado).
 *
 * Posiciona-se logo abaixo do `anchorEl` (passado pelo consumer via ref) com
 * `position: fixed` e bounding rect computado em runtime.
 */
export function ColorPickerPopover({ value, onChange, onClose, anchorEl }: {
  value: string
  onChange: (hex: string) => void
  onClose: () => void
  anchorEl: HTMLElement | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState(value)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Posiciona o popover logo abaixo do anchor; recomputa em scroll/resize
  // para acompanhar o anchor se a página rolar enquanto aberto.
  useLayoutEffect(() => {
    if (!anchorEl) return
    function place() {
      if (!anchorEl) return
      const r = anchorEl.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchorEl])

  // Outside click fecha o popover. Inclui o anchor na "área segura" pra
  // que o clique no swatch trigger toggle (não duplo-fecha-e-reabre).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current) return
      const target = e.target as Node
      if (ref.current.contains(target)) return
      if (anchorEl && anchorEl.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorEl])

  function applyCustom() {
    const v = custom.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(v)
      onClose()
    }
  }

  if (!pos) return null

  return createPortal(
    <div
      ref={ref}
      className="hq-animate-fade-up"
      style={{
        position: 'fixed',
        top: pos.top, left: pos.left,
        padding: 10,
        zIndex: 10000,
        minWidth: 184,
        background: 'rgba(8, 12, 18, 0.96)',
        border: '1px solid rgba(143, 191, 211, 0.45)',
        borderRadius: 0,
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
        boxShadow: '0 0 24px rgba(143, 191, 211, 0.25), 0 8px 28px rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, fontWeight: 700,
        color: 'var(--color-ice-light)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
        PALETTE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 5 }}>
        {AREA_COLOR_PALETTE.map(c => {
          const selected = value.toLowerCase() === c.toLowerCase()
          return (
            <button
              key={c}
              onClick={() => { onChange(c); onClose() }}
              title={c}
              style={{
                width: 22, height: 22, background: c,
                border: selected
                  ? '1px solid var(--color-ice-light)'
                  : '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                cursor: 'pointer', padding: 0,
                boxShadow: selected
                  ? `0 0 12px ${c}, 0 0 4px ${c}`
                  : `0 0 6px ${c}88`,
                transition: 'transform 0.12s, box-shadow 0.12s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.12)'
                e.currentTarget.style.boxShadow = `0 0 14px ${c}, 0 0 5px ${c}`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = selected
                  ? `0 0 12px ${c}, 0 0 4px ${c}`
                  : `0 0 6px ${c}88`
              }}
            />
          )
        })}
      </div>
      <div style={{
        display: 'flex', gap: 6, marginTop: 10,
        borderTop: '1px solid rgba(143, 191, 211, 0.25)', paddingTop: 8,
      }}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') applyCustom() }}
          placeholder="#rrggbb"
          style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(143, 191, 211, 0.25)',
            color: 'var(--color-ice-light)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 600,
            padding: '5px 7px',
            outline: 'none',
            letterSpacing: '0.06em',
            borderRadius: 0,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-ice)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.25)')}
        />
        <button
          onClick={applyCustom}
          style={{
            background: 'rgba(143, 191, 211, 0.14)',
            border: '1px solid rgba(143, 191, 211, 0.45)',
            color: 'var(--color-ice-light)',
            fontFamily: 'var(--font-mono)',
            fontSize: 9, fontWeight: 700,
            padding: '5px 10px',
            cursor: 'pointer',
            borderRadius: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(143, 191, 211, 0.22)'
            e.currentTarget.style.boxShadow = '0 0 10px rgba(143, 191, 211, 0.30)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(143, 191, 211, 0.14)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          OK
        </button>
      </div>
    </div>,
    document.body,
  )
}

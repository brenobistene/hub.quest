import { useEffect, useRef, useState } from 'react'

// Palette de 12 cores pras áreas. Intencionalmente em hex literal e não CSS
// vars — estes valores são **persistidos** no banco (em `area.color`) e devem
// sobreviver a mudanças de tema sem "pular" pra uma cor diferente.
export const AREA_COLOR_PALETTE = [
  '#e85d3a', '#c46a5a', '#f5a962', '#9d7a4a',
  '#7fb069', '#5a7a6a', '#7a9a8a', '#4a9eff',
  '#4a5566', '#9d6cff', '#b97a9a', '#6b7280',
]

/**
 * Small popover with a 12-swatch palette plus a `#rrggbb` text input for
 * arbitrary colors. Positions itself absolutely below its anchor — the
 * parent must provide `position: relative`. Closes on outside click.
 */
export function ColorPickerPopover({ value, onChange, onClose }: {
  value: string
  onChange: (hex: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState(value)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function applyCustom() {
    const v = custom.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(v)
      onClose()
    }
  }

  return (
    <div
      ref={ref}
      className="hq-glass-elevated hq-animate-fade-up"
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0,
        padding: 'var(--space-2)',
        zIndex: 200, minWidth: 180,
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 20px)', gap: 4 }}>
        {AREA_COLOR_PALETTE.map(c => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose() }}
            title={c}
            style={{
              width: 20, height: 20, background: c,
              border: value.toLowerCase() === c.toLowerCase() ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border)',
              borderRadius: 3, cursor: 'pointer', padding: 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') applyCustom() }}
          placeholder="#rrggbb"
          style={{
            flex: 1, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)', fontSize: 11, padding: '4px 6px', borderRadius: 3,
            outline: 'none', fontFamily: 'monospace',
          }}
        />
        <button
          onClick={applyCustom}
          style={{
            background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)', fontSize: 10, padding: '4px 8px', cursor: 'pointer',
            borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.1em',
          }}
        >
          OK
        </button>
      </div>
    </div>
  )
}

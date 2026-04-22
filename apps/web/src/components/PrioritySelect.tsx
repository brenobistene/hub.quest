import { useEffect, useRef, useState } from 'react'

export const PRIORITIES: { key: string; label: string; color: string }[] = [
  { key: 'critical', label: 'Crítica', color: 'var(--color-accent-primary)' },
  { key: 'high',     label: 'Alta',    color: 'var(--color-warning)' },
  { key: 'medium',   label: 'Média',   color: 'var(--color-accent-light)' },
  { key: 'low',      label: 'Baixa',   color: 'var(--color-text-tertiary)' },
]

/**
 * Seletor inline de prioridade de projeto/quest. Mesmo padrão visual do
 * StatusDropdown: label com sublinhado dashed que abre um pop-down ao clicar,
 * fecha no click fora. Cores distintas por nível pra sinalizar criticidade.
 */
export function PrioritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

  const current = PRIORITIES.find(p => p.key === value) ?? PRIORITIES[2] // fallback: Média

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 10, textTransform: 'uppercase',
          letterSpacing: '0.15em', cursor: 'pointer', userSelect: 'none',
          borderBottom: '1px dashed var(--color-border)', paddingBottom: 1,
          color: current.color, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: current.color,
          display: 'inline-block',
        }} />
        {current.label}
      </span>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 6,
          background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          zIndex: 100, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          borderRadius: 3, overflow: 'hidden',
        }}>
          {PRIORITIES.map(p => {
            const active = p.key === value
            return (
              <div
                key={p.key}
                onClick={() => { onChange(p.key); setOpen(false) }}
                style={{
                  padding: '9px 14px', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  background: active ? 'var(--color-border)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = active ? 'var(--color-border)' : 'var(--color-bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.background = active ? 'var(--color-border)' : 'transparent')}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', background: p.color,
                  flexShrink: 0,
                }} />
                {p.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Legenda collapsable do /calendario. Renderizada inline no rodapé do
 * conteúdo (não fixed/floating, pra não competir com a active session
 * banner). Default fechada — toggle simples no botão de header.
 *
 * Cada item lista cor + tipo + label. Ordem reflete prioridade de
 * leitura do usuário: o que aparece como block primeiro, depois markers.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface LegendEntry {
  swatch: string          // hex ou CSS var
  label: string
  detail?: string         // descrição curta opcional
  shape?: 'block' | 'dot' // bloco retangular (default) ou bolinha (markers)
}

const ENTRIES: LegendEntry[] = [
  { swatch: 'var(--color-ice)',           label: 'Quest', detail: 'sessões de quest concluídas/em andamento' },
  { swatch: 'var(--color-warning)',       label: 'Tarefa', detail: 'sessões de tarefa' },
  { swatch: 'var(--color-success)',       label: 'Rotina', detail: 'horário fixo daily/weekly' },
  { swatch: '#dc2531',                    label: 'Ritual', detail: 'cadência semanal/mensal alocada' },
  { swatch: 'var(--color-ice-light)',     label: 'Exercício', detail: 'pendência diária com horário sugerido' },
  { swatch: '#9b88c4',                    label: 'Mind', detail: 'observação cognitiva diária' },
  { swatch: 'var(--color-accent-vivid)',  label: 'Deadline', detail: 'marcador no dia da entrega', shape: 'dot' },
  { swatch: 'rgba(143, 191, 211, 0.20)',  label: 'Improdutivo', detail: 'bloco não-produtivo (alimentação, locomoção)' },
]

export function CalendarLegend() {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        marginTop: 24,
        background: 'rgba(8, 12, 18, 0.55)',
        border: '1px solid var(--color-border)',
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'color var(--motion-fast) var(--ease-smooth)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ice-light)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
      >
        {open
          ? <ChevronDown size={11} strokeWidth={1.8} />
          : <ChevronRight size={11} strokeWidth={1.8} />}
        <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
        LEGENDA
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.12em', fontSize: 8 }}>
          {ENTRIES.length} TIPOS
        </span>
      </button>

      {open && (
        <div
          style={{
            borderTop: '1px solid var(--color-divider)',
            padding: '12px 14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 8,
          }}
        >
          {ENTRIES.map(entry => (
            <div
              key={entry.label}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--color-text-secondary)',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  width: entry.shape === 'dot' ? 6 : 12,
                  height: entry.shape === 'dot' ? 6 : 8,
                  borderRadius: entry.shape === 'dot' ? '50%' : 0,
                  background: entry.swatch,
                  border: entry.shape === 'dot' ? 'none' : `1px solid ${entry.swatch}`,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                  }}
                >
                  {entry.label}
                </div>
                {entry.detail && (
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-muted)',
                      fontStyle: 'italic',
                      marginTop: 1,
                      lineHeight: 1.4,
                    }}
                  >
                    {entry.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

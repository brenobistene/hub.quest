import { createPortal } from 'react-dom'
import { parseIsoAsUtc, formatHMS } from '../utils/datetime'

/**
 * Modal listing every session (closed + optionally in-progress) of an
 * entity. Triggered by clicking the timer either on the banner or inside
 * a RunnableControls row.
 */
export function SessionHistoryModal({ sessions, onClose }: {
  sessions: { started_at: string; ended_at: string | null }[]
  onClose: () => void
}) {
  function fmtRange(startIso: string, endIso: string | null): string {
    if (!startIso) return ''
    const start = parseIsoAsUtc(startIso)
    const startT = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const date = start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    if (!endIso) return `${startT} – em andamento  ·  ${date}`
    const end = parseIsoAsUtc(endIso)
    const endT = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${startT} – ${endT}  ·  ${date}`
  }

  function durSec(s: { started_at: string; ended_at: string | null }): number {
    if (!s.started_at) return 0
    const st = parseIsoAsUtc(s.started_at).getTime()
    const en = s.ended_at ? parseIsoAsUtc(s.ended_at).getTime() : Date.now()
    return Math.max(0, Math.floor((en - st) / 1000))
  }

  const total = sessions.reduce((sum, s) => sum + durSec(s), 0)

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          borderRadius: 4, padding: 20, maxWidth: 400, minWidth: 320, maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--color-text-primary)', fontSize: 14, margin: 0 }}>Sessões</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 16 }}
          >
            ×
          </button>
        </div>
        {sessions.length === 0 ? (
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>Nenhuma sessão iniciada</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((s, idx) => (
              <div
                key={idx}
                style={{
                  padding: 10, background: 'var(--color-bg-primary)', borderRadius: 2,
                  fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 500 }}>
                  Sessão {String(idx + 1).padStart(2, '0')} — {formatHMS(durSec(s))}
                </div>
                <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  {fmtRange(s.started_at, s.ended_at)}
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Tempo total
              </span>
              <span style={{ color: 'var(--color-accent-light)', fontSize: 12, fontWeight: 600 }}>
                {formatHMS(total)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

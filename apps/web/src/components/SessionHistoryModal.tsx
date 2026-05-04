import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, Check, X as XIcon, AlertTriangle } from 'lucide-react'
import { parseIsoAsUtc, formatHMS } from '../utils/datetime'
import {
  editQuestSession, editTaskSession, editRoutineSession,
  deleteQuestSession, deleteTaskSession, deleteRoutineSessionById,
  reportApiError,
} from '../api'
import {
  modalOverlay, modalShell, modalHairline, modalHeader, modalBody,
} from '../pages/finance/components/styleHelpers'

/**
 * Modal listando todas as sessões (fechadas + em andamento) de uma entity.
 * Triggered pelo cronômetro do RunnableControls e pelo banner global.
 *
 * Quando `kind` é fornecido junto com sessões que têm `id`, cada linha
 * ganha botões editar (lápis) + excluir (lixeira). Editar abre subdialog
 * inline com 2 inputs `datetime-local`. Sessão em andamento (ended_at=null)
 * só permite editar `started_at` — pra mexer no fim, usuário pausa antes.
 */
export function SessionHistoryModal({ sessions, onClose, kind, onChanged }: {
  sessions: { id?: number; started_at: string; ended_at: string | null }[]
  onClose: () => void
  /** Tipo da entity — necessário pra escolher o endpoint de PATCH/DELETE.
   *  Se omitido, modal fica em modo read-only (sem editar/excluir). */
  kind?: 'quest' | 'task' | 'routine'
  /** Disparado após uma edição/exclusão bem-sucedida. Geralmente é o
   *  `onSessionUpdate` do parent, que refaz fetch global de sessões. */
  onChanged?: () => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const canEdit = !!kind && !!onChanged

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

  const editFn = kind === 'quest' ? editQuestSession : kind === 'task' ? editTaskSession : editRoutineSession
  const deleteFn = kind === 'quest' ? deleteQuestSession : kind === 'task' ? deleteTaskSession : deleteRoutineSessionById

  async function handleDelete(sid: number) {
    if (!canEdit) return
    if (!window.confirm('Excluir esta sessão? O tempo registrado será removido permanentemente.')) return
    try {
      await deleteFn(sid)
      onChanged!()
    } catch (err) {
      reportApiError('SessionHistoryModal.delete', err)
      alert('Erro ao excluir — veja o console (F12).')
    }
  }

  const total = sessions.reduce((sum, s) => sum + durSec(s), 0)

  return createPortal(
    <div onClick={onClose} style={{ ...modalOverlay(), zIndex: 1000 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...modalShell(),
          maxWidth: 480, minWidth: 360, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={modalHairline} />
        <div style={modalHeader()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: 'var(--color-text-primary)', fontSize: 14, margin: 0 }}>Sessões</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 16 }}
          >
            ×
          </button>
        </div>
        </div>
        <div style={{ ...modalBody(), overflowY: 'auto', flex: 1 }}>

        {warning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', marginBottom: 12,
            background: 'rgba(245, 169, 98, 0.12)',
            border: '1px solid var(--color-warning)',
            borderRadius: 3, fontSize: 11, color: 'var(--color-warning)',
          }}>
            <AlertTriangle size={13} strokeWidth={2} />
            <span>{warning}</span>
          </div>
        )}

        {sessions.length === 0 ? (
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>Nenhuma sessão iniciada</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((s, idx) => {
              const isEditing = editingId != null && s.id === editingId
              return (
                <div
                  key={s.id ?? idx}
                  style={{
                    padding: 10, background: 'var(--color-bg-primary)', borderRadius: 2,
                    fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5,
                  }}
                >
                  {isEditing ? (
                    <SessionEditForm
                      session={s}
                      onCancel={() => setEditingId(null)}
                      onSave={async (patch) => {
                        if (!canEdit || !s.id) return
                        try {
                          const resp = await editFn(s.id, patch) as any
                          setEditingId(null)
                          setWarning(resp?.overlap_warning
                            ? 'Atenção: essa sessão se sobrepõe com outra da mesma atividade.'
                            : null)
                          onChanged!()
                        } catch (err: any) {
                          alert(err?.detail || err?.message || 'Erro ao salvar.')
                        }
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>
                          Sessão {String(idx + 1).padStart(2, '0')} — {formatHMS(durSec(s))}
                        </div>
                        <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                          {fmtRange(s.started_at, s.ended_at)}
                        </div>
                      </div>
                      {canEdit && s.id != null && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => { setEditingId(s.id!); setWarning(null) }}
                            title="Editar horários"
                            style={iconBtnStyle}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                          >
                            <Pencil size={12} strokeWidth={1.8} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id!)}
                            title="Excluir sessão"
                            style={iconBtnStyle}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-vivid)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                          >
                            <Trash2 size={12} strokeWidth={1.8} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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
      </div>
    </div>,
    document.body
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-muted)', padding: 4,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'color 0.15s',
}

/** Form inline pra editar started_at/ended_at de uma sessão. */
function SessionEditForm({ session, onSave, onCancel }: {
  session: { id?: number; started_at: string; ended_at: string | null }
  onSave: (patch: { started_at?: string; ended_at?: string | null }) => Promise<void>
  onCancel: () => void
}) {
  // ISO UTC do backend → string local pro input datetime-local (sem tz).
  // Format esperado: "YYYY-MM-DDTHH:MM" (sem segundos, sem timezone).
  const toLocalInput = (iso: string): string => {
    if (!iso) return ''
    const d = parseIsoAsUtc(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  // Inverso: input local → ISO UTC pro backend.
  const toIsoUtc = (local: string): string => {
    if (!local) return ''
    return new Date(local).toISOString()
  }

  const isOngoing = session.ended_at == null
  const [start, setStart] = useState(toLocalInput(session.started_at))
  const [end, setEnd] = useState(session.ended_at ? toLocalInput(session.ended_at) : '')
  const [saving, setSaving] = useState(false)

  // Duração calculada em tempo real pra feedback visual.
  const durMin = (() => {
    if (!start) return 0
    const s = new Date(start).getTime()
    const e = end ? new Date(end).getTime() : Date.now()
    return Math.max(0, Math.floor((e - s) / 60000))
  })()
  const durLabel = (() => {
    const h = Math.floor(durMin / 60)
    const m = durMin % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  })()

  async function handleSave() {
    setSaving(true)
    try {
      const patch: { started_at?: string; ended_at?: string | null } = {}
      const startIso = toIsoUtc(start)
      if (startIso !== session.started_at) patch.started_at = startIso
      if (!isOngoing) {
        const endIso = end ? toIsoUtc(end) : null
        if (endIso !== session.ended_at) patch.ended_at = endIso
      }
      await onSave(patch)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Início
        </span>
        <input
          type="datetime-local"
          autoComplete="off"
          name="session-start"
          value={start}
          onChange={e => setStart(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Fim {isOngoing && <em style={{ color: 'var(--color-warning)' }}>· em andamento — pause antes pra editar</em>}
        </span>
        <input
          type="datetime-local"
          autoComplete="off"
          name="session-end"
          value={end}
          onChange={e => setEnd(e.target.value)}
          disabled={isOngoing}
          style={{ ...inputStyle, opacity: isOngoing ? 0.4 : 1, cursor: isOngoing ? 'not-allowed' : 'text' }}
        />
      </div>
      <div style={{
        fontSize: 10, color: 'var(--color-text-tertiary)',
        fontFamily: 'var(--font-mono)',
        marginTop: 2,
      }}>
        Duração: <strong style={{ color: 'var(--color-accent-light)' }}>{durLabel}</strong>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...actionBtn,
            background: 'var(--color-success)', color: 'var(--color-bg-primary)',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Check size={11} strokeWidth={2.4} /> Salvar
        </button>
        <button onClick={onCancel} style={{ ...actionBtn, background: 'transparent', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
          <XIcon size={11} strokeWidth={2.4} /> Cancelar
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
  padding: '5px 8px',
  fontSize: 11,
  borderRadius: 2,
  outline: 'none',
  fontFamily: 'var(--font-mono)',
  colorScheme: 'dark',
}

const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  border: 'none', cursor: 'pointer',
  fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 2,
  letterSpacing: '0.05em', textTransform: 'uppercase',
}

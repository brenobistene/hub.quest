import { useEffect, useRef, useState } from 'react'
import type { Quest } from '../types'
import { fetchSessions, startSession, pauseSession, resumeSession, reportApiError } from '../api'
import { parseIsoAsUtc } from '../utils/datetime'

/**
 * Legacy quest play/pause/resume/finalize cluster used inside QuestRow.
 * Shows elapsed time, handles 409 conflicts by surfacing a "quest em andamento"
 * modal, lets the user link a deliverable_id when the quest is a subtask, and
 * exposes a delete-confirmation modal.
 *
 * Prefer RunnableControls for new code — this one is tied to the old
 * quest-only flow and carries extra UI affordances.
 */
export function StartPauseButton({ questId, onSessionChange, onUpdate, status, onDelete, deliverables = [], isSubtask, linkedDeliverableId, sessionUpdateTrigger = 0 }: { questId: string; onSessionChange?: () => void; onUpdate?: (id: string, patch: Partial<Quest>) => void; status?: string; onDelete?: (id: string) => void; deliverables?: Array<{ id: string; title: string; done: boolean; estimated_minutes?: number; minutes_worked?: number; deadline?: string }>; isSubtask?: boolean; linkedDeliverableId?: string | null; sessionUpdateTrigger?: number }) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [timer, setTimer] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeliverableDropdown, setShowDeliverableDropdown] = useState(false)
  const [conflictTitle, setConflictTitle] = useState<string | null>(null)
  const sessionsRef = useRef<any[]>([])
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSessions(questId).then(setSessions).catch(err => reportApiError('StartPauseButton', err))
  }, [questId, sessionUpdateTrigger])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    if (!showDeliverableDropdown) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDeliverableDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDeliverableDropdown])

  useEffect(() => {
    const calculateAndUpdateTimer = () => {
      let total = 0
      const now = Date.now()
      const activeSession = sessionsRef.current.find(s => !s.ended_at)
      if (activeSession) {
        const start = parseIsoAsUtc(activeSession.started_at).getTime()
        if (!isNaN(start)) total = (now - start) / 1000
      }
      setTimer(Math.max(0, total))
    }
    calculateAndUpdateTimer()
    timerIntervalRef.current = setInterval(calculateAndUpdateTimer, 100)
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [])

  const activeSession = sessions.find(s => !s.ended_at)

  async function handleStart() {
    setLoading(true)
    try {
      await startSession(questId)
      const updated = await fetchSessions(questId)
      setSessions(updated)
      onSessionChange?.()
    } catch (e: any) {
      if (e?.conflictTitle) {
        setConflictTitle(e.conflictTitle)
      } else {
        console.error(e)
      }
    }
    finally { setLoading(false) }
  }

  async function handlePauseResume() {
    setLoading(true)
    try {
      if (activeSession) {
        await pauseSession(questId)
      } else {
        await resumeSession(questId)
      }
      const updated = await fetchSessions(questId)
      setSessions(updated)
      onSessionChange?.()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleFinalize() {
    setLoading(true)
    try {
      if (activeSession) {
        await pauseSession(questId)
      }
      onUpdate?.(questId, { status: 'done' })
      const updated = await fetchSessions(questId)
      setSessions(updated)
      onSessionChange?.()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const fmtSessionTime = (startIso: string, endIso?: string) => {
    const startStr = startIso.endsWith('Z') ? startIso : startIso + 'Z'
    const start = new Date(startStr)
    const startTime = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
    if (!endIso) {
      const date = start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      return `${startTime} - ? ${date}`
    }
    const endStr = endIso.endsWith('Z') ? endIso : endIso + 'Z'
    const end = new Date(endStr)
    const endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const date = start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    return `${startTime} - ${endTime} ${date}`
  }

  const getSessionDuration = (session: any) => {
    const start = parseIsoAsUtc(session.started_at).getTime()
    const end = session.ended_at ? parseIsoAsUtc(session.ended_at).getTime() : new Date().getTime()
    if (isNaN(start) || isNaN(end)) return 0
    return Math.max(0, Math.floor((end - start) / 1000))
  }

  const totalDuration = status === 'done' ? sessions.reduce((sum, s) => sum + getSessionDuration(s), 0) : 0

  return (
    <>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteConfirm(true)
          }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-accent-light)', fontSize: 10, padding: '2px 4px',
            transition: 'all 0.15s', display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-accent-vivid)'
            e.currentTarget.style.opacity = '0.8'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-accent-light)'
            e.currentTarget.style.opacity = '1'
          }}
          title="Excluir quest"
        >
          🗑️
        </button>
      )}
      {status === 'done' ? (
        <>
          <span
            onClick={() => sessions.length > 0 && setShowModal(true)}
            style={{
              fontSize: 10, color: 'var(--color-success-light)', minWidth: 40,
              cursor: sessions.length > 0 ? 'pointer' : 'auto',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => sessions.length > 0 && (e.currentTarget.style.color = 'var(--color-success-hover)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-success-light)')}
          >
            {fmtTime(totalDuration)}
          </span>
          <button
            onClick={() => onUpdate?.(questId, { status: 'pending' })}
            style={{
              background: 'none', border: '1px solid var(--color-purple)', cursor: 'pointer',
              color: 'var(--color-purple)', padding: '4px 8px', fontSize: 11,
              transition: 'all 0.15s',
              opacity: loading ? 0.5 : 1,
            }}
            disabled={loading}
            onMouseEnter={e => !loading && (e.currentTarget.style.background = 'var(--color-purple)', e.currentTarget.style.color = 'var(--color-bg-primary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = 'var(--color-purple)')}
            title="Retornar para ativo"
          >
            ↻ Retornar
          </button>
          {isSubtask && deliverables.length > 0 && (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {linkedDeliverableId && (
                  <span style={{ fontSize: 10, color: 'var(--color-success-light)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deliverables.find(d => d.id === linkedDeliverableId)?.title}
                  </span>
                )}
                <button
                  onClick={() => setShowDeliverableDropdown(!showDeliverableDropdown)}
                  disabled={loading}
                  style={{
                    background: 'none', border: '1px solid var(--color-text-secondary)', cursor: 'pointer',
                    color: 'var(--color-text-secondary)', padding: '4px 6px', fontSize: 11,
                    transition: 'all 0.15s',
                    opacity: loading ? 0.5 : 1,
                  }}
                  onMouseEnter={e => !loading && (e.currentTarget.style.borderColor = '#9a9790', e.currentTarget.style.color = '#9a9790')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-text-secondary)', e.currentTarget.style.color = 'var(--color-text-secondary)')}
                  title="Vincular entregável"
                >
                  {showDeliverableDropdown ? '▼' : '▶'}
                </button>
              </div>

              {showDeliverableDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    minWidth: 220,
                    maxHeight: 300,
                    overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 100,
                  }}
                >
                  {deliverables.map(d => (
                    <div
                      key={d.id}
                      onClick={() => {
                        onUpdate?.(questId, { deliverable_id: d.id })
                        setShowDeliverableDropdown(false)
                      }}
                      style={{
                        padding: '9px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid var(--color-bg-primary)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-border)', e.currentTarget.style.color = 'var(--color-text-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = 'var(--color-text-secondary)')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{d.title}</span>
                        {d.done && <span style={{ fontSize: 10, color: 'var(--color-success-light)' }}>✓</span>}
                      </div>
                      {d.estimated_minutes && (
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                          ~{d.estimated_minutes >= 60 ? `${Math.floor(d.estimated_minutes / 60)}h ${d.estimated_minutes % 60}m` : `${d.estimated_minutes}m`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <span
            onClick={() => sessions.length > 0 && setShowModal(true)}
            style={{
              fontSize: 10, color: 'var(--color-text-tertiary)', minWidth: 40,
              cursor: sessions.length > 0 ? 'pointer' : 'auto',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => sessions.length > 0 && (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            {fmtTime(timer)}
          </span>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!activeSession ? (
              <button
                onClick={handleStart}
                disabled={loading}
                style={{
                  background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                  color: 'var(--color-text-muted)', padding: '4px 8px', fontSize: 11,
                  transition: 'all 0.15s',
                  opacity: loading ? 0.5 : 1,
                }}
                onMouseEnter={e => !loading && (e.currentTarget.style.borderColor = 'var(--color-accent-light)', e.currentTarget.style.color = 'var(--color-accent-light)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)', e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                ▶ Start
              </button>
            ) : (
              <button
                onClick={() => handlePauseResume()}
                disabled={loading}
                style={{
                  background: 'none', border: '1px solid var(--color-accent-light)', cursor: 'pointer',
                  color: 'var(--color-accent-light)', padding: '4px 6px', fontSize: 11,
                  transition: 'all 0.15s',
                  opacity: loading ? 0.5 : 1,
                }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background = 'var(--color-accent-light)', e.currentTarget.style.color = 'var(--color-bg-primary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = 'var(--color-accent-light)')}
              >
                ⏸
              </button>
            )}
            {sessions.length > 0 && (
              <button
                onClick={handleFinalize}
                disabled={loading}
                style={{
                  background: 'none', border: '1px solid var(--color-success-light)', cursor: 'pointer',
                  color: 'var(--color-success-light)', padding: '4px 8px', fontSize: 11,
                  transition: 'all 0.15s',
                  opacity: loading ? 0.5 : 1,
                }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background = 'var(--color-success-light)', e.currentTarget.style.color = 'var(--color-bg-primary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none', e.currentTarget.style.color = 'var(--color-success-light)')}
              >
                ✓ Finalizar
              </button>
            )}
            {isSubtask && deliverables.length > 0 && (
              <div style={{ position: 'relative', opacity: 1 }} ref={dropdownRef}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {linkedDeliverableId && (
                    <span style={{ fontSize: 10, color: 'var(--color-success-light)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {deliverables.find(d => d.id === linkedDeliverableId)?.title}
                    </span>
                  )}
                  <button
                    onClick={() => setShowDeliverableDropdown(!showDeliverableDropdown)}
                    disabled={loading}
                    style={{
                      background: 'none', border: '1px solid var(--color-text-secondary)', cursor: 'pointer',
                      color: 'var(--color-text-secondary)', padding: '4px 6px', fontSize: 11,
                      transition: 'all 0.15s',
                      opacity: loading ? 0.5 : 1,
                    }}
                    onMouseEnter={e => !loading && (e.currentTarget.style.borderColor = '#9a9790', e.currentTarget.style.color = '#9a9790')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-text-secondary)', e.currentTarget.style.color = 'var(--color-text-secondary)')}
                    title="Vincular entregável"
                  >
                    {showDeliverableDropdown ? '▼' : '▶'}
                  </button>
                </div>

                {showDeliverableDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      minWidth: 220,
                      maxHeight: 300,
                      overflowY: 'auto',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      zIndex: 100,
                    }}
                  >
                    {deliverables.map(d => (
                      <div
                        key={d.id}
                        onClick={() => {
                          onUpdate?.(questId, { deliverable_id: d.id })
                          setShowDeliverableDropdown(false)
                        }}
                        style={{
                          padding: '9px 14px',
                          fontSize: 12,
                          cursor: 'pointer',
                          color: 'var(--color-text-secondary)',
                          borderBottom: '1px solid var(--color-bg-primary)',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-border)', e.currentTarget.style.color = 'var(--color-text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = 'var(--color-text-secondary)')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{d.title}</span>
                          {d.done && <span style={{ fontSize: 10, color: 'var(--color-success-light)' }}>✓</span>}
                        </div>
                        {d.estimated_minutes && (
                          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                            ~{d.estimated_minutes >= 60 ? `${Math.floor(d.estimated_minutes / 60)}h ${d.estimated_minutes % 60}m` : `${d.estimated_minutes}m`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {showModal && (
      <div
        onClick={() => setShowModal(false)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 4,
            padding: 20, maxWidth: 400, maxHeight: '80vh', overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: 'var(--color-text-primary)', fontSize: 14, margin: 0 }}>Sessões</h3>
            <button
              onClick={() => setShowModal(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-tertiary)', fontSize: 16,
              }}
            >
              ×
            </button>
          </div>

          {sessions.length === 0 ? (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>Nenhuma sessão iniciada</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map((s, idx) => {
                const duration = getSessionDuration(s)
                const timeRange = fmtSessionTime(s.started_at, s.ended_at)
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: 10, background: 'var(--color-bg-primary)', borderRadius: 2,
                      fontSize: 11, color: 'var(--color-text-primary)', lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      Sessão {String(idx + 1).padStart(2, '0')} — {fmtTime(duration)}
                    </div>
                    <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {timeRange}
                    </div>
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
                  {fmtTime(sessions.reduce((sum, s) => sum + getSessionDuration(s), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {showDeleteConfirm && (
      <div
        onClick={() => setShowDeleteConfirm(false)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 4,
            padding: 24, maxWidth: 300,
          }}
        >
          <h3 style={{ color: 'var(--color-text-primary)', fontSize: 14, margin: '0 0 16px 0' }}>Excluir quest?</h3>
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12, margin: '0 0 20px 0' }}>
            Tem certeza que deseja excluir esta quest? Esta ação não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                color: 'var(--color-text-tertiary)', padding: '8px 16px', fontSize: 11,
                borderRadius: 4, transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
              }}
            >
              Não
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                onDelete?.(questId)
              }}
              style={{
                background: 'var(--color-accent-light)', border: 'none', cursor: 'pointer',
                color: 'var(--color-bg-primary)', padding: '8px 16px', fontSize: 11,
                borderRadius: 4, transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Sim
            </button>
          </div>
        </div>
      </div>
    )}

    {conflictTitle && (
      <div
        onClick={() => setConflictTitle(null)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1002,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 4,
            padding: 24, maxWidth: 320,
          }}
        >
          <h3 style={{ color: 'var(--color-accent-vivid)', fontSize: 14, margin: '0 0 16px 0' }}>Quest em andamento</h3>
          <p style={{ color: 'var(--color-text-primary)', fontSize: 12, margin: '0 0 20px 0', lineHeight: 1.6 }}>
            Finalize <strong>"{conflictTitle}"</strong> antes de iniciar uma nova quest.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConflictTitle(null)}
              style={{
                background: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer',
                color: 'var(--color-bg-primary)', padding: '8px 16px', fontSize: 11,
                borderRadius: 4, transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

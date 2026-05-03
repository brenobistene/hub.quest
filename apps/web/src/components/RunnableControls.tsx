import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { ActiveSession } from '../types'
import {
  startSession, pauseSession, resumeSession, patchQuest,
  startTaskSession, pauseTaskSession, resumeTaskSession, stopTaskSession,
  startRoutineSession, pauseRoutineSession, resumeRoutineSession, stopRoutineSession,
} from '../api'
import { parseIsoAsUtc, sumClosedSessionsSeconds, formatHMS } from '../utils/datetime'
import { SessionHistoryModal } from './SessionHistoryModal'

/**
 * Play/pause/resume/stop cluster + live timer for a quest / task / routine.
 *
 * Behavior:
 * - If this entity is the currently active (or paused) session globally,
 *   shows the current-session timer (same as banner) + pause/resume + finalize.
 * - If another entity is active, shows total accumulated time (if any) + play.
 *   A 409 on start/resume means something else is running; the user is alerted
 *   with the conflicting entity title.
 * - If `done` is true, shows a "FEITO" badge + optional reopen button.
 *
 * Finalize semantics:
 * - quest → patchQuest status='done' (after pausing if still running)
 * - task  → stopTaskSession (fecha sessão + marca done)
 * - routine → stopRoutineSession (fecha sessão + cria routine_log do dia)
 */
export function RunnableControls({ runnableType, id, sessions, activeSession, onSessionUpdate, target, done, onReopen }: {
  runnableType: 'quest' | 'task' | 'routine'
  id: string
  sessions: { id?: number; started_at: string; ended_at: string | null }[]
  activeSession: ActiveSession | null
  onSessionUpdate: () => void
  target?: string
  done?: boolean
  onReopen?: () => void
}) {
  const isThis = !!activeSession && activeSession.type === runnableType && activeSession.id === id
  const running = isThis && activeSession!.is_active

  const closedSec = sumClosedSessionsSeconds(sessions)
  const [liveSec, setLiveSec] = useState(0)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (!isThis || !activeSession) { setLiveSec(0); return }
    const start = parseIsoAsUtc(activeSession.started_at).getTime()
    if (isNaN(start)) { setLiveSec(0); return }
    if (running) {
      const tick = () => setLiveSec(Math.max(0, Math.floor((Date.now() - start) / 1000)))
      tick()
      const iv = setInterval(tick, 100)
      return () => clearInterval(iv)
    } else if (activeSession.ended_at) {
      const end = parseIsoAsUtc(activeSession.ended_at).getTime()
      if (!isNaN(end)) setLiveSec(Math.max(0, Math.floor((end - start) / 1000)))
      else setLiveSec(0)
    } else {
      setLiveSec(0)
    }
  }, [isThis, running, activeSession?.started_at, activeSession?.ended_at])

  const displaySec = isThis ? liveSec : closedSec

  async function handlePlay() {
    try {
      if (runnableType === 'quest') await startSession(id)
      else if (runnableType === 'task') await startTaskSession(id)
      else await startRoutineSession(id, target)
      onSessionUpdate()
    } catch (err: any) {
      if (err?.conflictTitle) alert(`"${err.conflictTitle}" está em execução. Pause antes.`)
      else alert('Erro ao iniciar sessão — veja o console (F12).')
      console.error('[runnable] start failed', { runnableType, id, err })
    }
  }
  async function handlePause() {
    try {
      if (runnableType === 'quest') await pauseSession(id)
      else if (runnableType === 'task') await pauseTaskSession(id)
      else await pauseRoutineSession(id, target)
      onSessionUpdate()
    } catch (err) {
      console.error('[runnable] pause failed', { runnableType, id, err })
      alert('Erro ao pausar — veja o console (F12).')
    }
  }
  async function handleResume() {
    try {
      if (runnableType === 'quest') await resumeSession(id)
      else if (runnableType === 'task') await resumeTaskSession(id)
      else await resumeRoutineSession(id, target)
      onSessionUpdate()
    } catch (err: any) {
      if (err?.conflictTitle) alert(`"${err.conflictTitle}" está em execução. Pause antes.`)
      else alert('Erro ao retomar — veja o console (F12).')
      console.error('[runnable] resume failed', { runnableType, id, err })
    }
  }
  async function handleStop() {
    try {
      if (runnableType === 'quest') {
        if (running) await pauseSession(id)
        await patchQuest(id, { status: 'done' })
      } else if (runnableType === 'task') {
        await stopTaskSession(id)
      } else {
        await stopRoutineSession(id, target)
      }
      onSessionUpdate()
    } catch (err) {
      console.error('[runnable] stop failed', { runnableType, id, err })
      alert('Erro ao finalizar — veja o console (F12).')
    }
  }

  const canShowHistory = sessions.length > 0

  if (done) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, color: 'var(--color-success)', letterSpacing: '0.15em',
            textTransform: 'uppercase', fontWeight: 700,
          }}>
            feito
          </span>
          {displaySec > 0 && (
            <span
              onClick={() => canShowHistory && setShowHistory(true)}
              title={canShowHistory ? 'ver histórico' : undefined}
              style={{
                fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)',
                cursor: canShowHistory ? 'pointer' : 'default', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (canShowHistory) e.currentTarget.style.color = 'var(--color-text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              {formatHMS(displaySec)}
            </span>
          )}
          {onReopen && (
            <button
              onClick={onReopen}
              title="reabrir"
              style={{
                background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                color: 'var(--color-text-tertiary)', padding: '4px 8px', fontSize: 10,
                borderRadius: 3, letterSpacing: '0.1em', textTransform: 'uppercase',
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
              ↻ reabrir
            </button>
          )}
        </div>
        {showHistory && <SessionHistoryModal sessions={sessions} kind={runnableType} onChanged={onSessionUpdate} onClose={() => setShowHistory(false)} />}
      </>
    )
  }

  if (!isThis) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {displaySec > 0 && (
            <span
              onClick={() => canShowHistory && setShowHistory(true)}
              title={canShowHistory ? 'ver histórico' : undefined}
              style={{
                fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)',
                cursor: canShowHistory ? 'pointer' : 'default',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (canShowHistory) e.currentTarget.style.color = 'var(--color-text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              {formatHMS(displaySec)}
            </span>
          )}
          <button
            onClick={handlePlay}
            title="iniciar sessão"
            style={{
              background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', padding: '4px 8px', fontSize: 10,
              borderRadius: 3, letterSpacing: '0.1em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-accent-light)'
              e.currentTarget.style.borderColor = 'var(--color-accent-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            <Play size={9} strokeWidth={2} fill="currentColor" />
            play
          </button>
        </div>
        {showHistory && <SessionHistoryModal sessions={sessions} kind={runnableType} onChanged={onSessionUpdate} onClose={() => setShowHistory(false)} />}
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          onClick={() => canShowHistory && setShowHistory(true)}
          title={canShowHistory ? 'ver histórico' : undefined}
          style={{
            fontSize: 12, fontWeight: 700,
            color: running ? 'var(--color-accent-primary)' : 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)',
            cursor: canShowHistory ? 'pointer' : 'default',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { if (canShowHistory) e.currentTarget.style.color = 'var(--color-text-primary)' }}
          onMouseLeave={e => {
            e.currentTarget.style.color = running ? 'var(--color-accent-primary)' : 'var(--color-text-tertiary)'
          }}
        >
          {formatHMS(displaySec)}
        </span>
        <button
          onClick={running ? handlePause : handleResume}
          title={running ? 'pausar' : 'retomar'}
          style={{
            background: running ? 'var(--color-accent-primary)' : 'var(--color-success)',
            border: 'none', cursor: 'pointer',
            color: 'var(--color-bg-primary)', padding: '4px 10px', fontSize: 10,
            borderRadius: 3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          {running ? 'pausar' : 'retomar'}
        </button>
        <button
          onClick={handleStop}
          title={runnableType === 'task' ? 'finalizar tarefa' : runnableType === 'routine' ? 'marcar feita hoje' : 'finalizar quest'}
          style={{
            background: 'none', border: '1px solid var(--color-success)',
            color: 'var(--color-success)', cursor: 'pointer',
            padding: '4px 10px', fontSize: 10,
            borderRadius: 3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          finalizar
        </button>
      </div>
      {showHistory && <SessionHistoryModal sessions={sessions} kind={runnableType} onChanged={onSessionUpdate} onClose={() => setShowHistory(false)} />}
    </>
  )
}

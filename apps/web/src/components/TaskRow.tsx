import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { ActiveSession, Task } from '../types'
import { fetchTaskSessions, reportApiError } from '../api'
import { InlineText } from './ui/InlineText'
import { RunnableControls } from './RunnableControls'
import { PrioritySelect } from './PrioritySelect'
import { parseTimeToMinutes, minutesToHmm, isValidDateInput } from '../utils/datetime'
import { confirmDialog } from '../lib/dialog'

/**
 * Task row used in the TasksView list and in the Dia "tarefas de hoje" area.
 * Cyberpunk CP2077 styling — chamfer-bl + ice border + hover glow + translateX.
 */
export function TaskRow({ task, onToggle, onUpdate, onDelete, activeSession, onSessionUpdate, sessionUpdateTrigger = 0 }: {
  task: Task
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Partial<Task>) => void
  onDelete: (id: string) => void
  activeSession?: ActiveSession | null
  onSessionUpdate?: () => void
  sessionUpdateTrigger?: number
}) {
  const [editingDate, setEditingDate] = useState(false)
  const [editingTime, setEditingTime] = useState(false)
  const [editingDuration, setEditingDuration] = useState(false)
  const [hover, setHover] = useState(false)
  const [startTime, setStartTime] = useState(task.start_time ?? '')
  const [endTime, setEndTime] = useState(task.end_time ?? '')
  const [duration, setDuration] = useState(task.duration_minutes ? minutesToHmm(task.duration_minutes) : '')
  const [taskSessions, setTaskSessions] = useState<{ started_at: string; ended_at: string | null }[]>([])

  useEffect(() => {
    fetchTaskSessions(task.id).then(setTaskSessions).catch(err => reportApiError('TaskRow', err))
  }, [task.id, sessionUpdateTrigger, activeSession?.type, activeSession?.id, activeSession?.started_at, activeSession?.ended_at])

  useEffect(() => { setStartTime(task.start_time ?? '') }, [task.start_time])
  useEffect(() => { setEndTime(task.end_time ?? '') }, [task.end_time])
  useEffect(() => { setDuration(task.duration_minutes ? minutesToHmm(task.duration_minutes) : '') }, [task.duration_minutes])

  function commitTime() {
    setEditingTime(false)
    const s = startTime || null
    const e = endTime || null
    if (s !== (task.start_time ?? null) || e !== (task.end_time ?? null)) {
      onUpdate(task.id, { start_time: s, end_time: e })
    }
  }

  function commitDuration() {
    setEditingDuration(false)
    const parsed = parseTimeToMinutes(duration)
    const next = parsed && parsed > 0 ? parsed : null
    if (next !== (task.duration_minutes ?? null)) {
      onUpdate(task.id, { duration_minutes: next })
    }
  }

  function formatDate(iso: string) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y.slice(-2)}`
  }

  // Atrasada = não feita e com scheduled_date < hoje.
  const todayYmd = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const isOverdue = !task.done && !!task.scheduled_date && task.scheduled_date < todayYmd

  const timeLabel = task.start_time && task.end_time
    ? `${task.start_time}–${task.end_time}`
    : task.start_time
      ? `${task.start_time}`
      : null

  const accentColor = task.done
    ? 'var(--color-success)'
    : isOverdue
      ? 'var(--color-accent-vivid)'
      : 'rgba(143, 191, 211, 0.55)'

  return (
    <div
      onMouseEnter={(e) => {
        setHover(true)
        if (task.done) return
        e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
        e.currentTarget.style.boxShadow = isOverdue
          ? '0 0 12px rgba(159, 18, 57, 0.20)'
          : '0 0 12px rgba(143, 191, 211, 0.18)'
        e.currentTarget.style.transform = 'translateX(2px)'
      }}
      onMouseLeave={(e) => {
        setHover(false)
        e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.18)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
      style={{
        position: 'relative',
        background: 'rgba(8, 12, 18, 0.55)',
        border: '1px solid rgba(143, 191, 211, 0.18)',
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: 0,
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
        padding: '10px 14px',
        opacity: task.done ? 0.7 : 1,
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
    >
      {/* Checkbox cyber chamferado */}
      <button
        onClick={() => onToggle(task.id)}
        title={task.done ? 'desmarcar' : 'concluir'}
        style={{
          width: 18, height: 18, flexShrink: 0, padding: 0,
          background: task.done ? 'rgba(94, 122, 82, 0.55)' : 'transparent',
          border: `1.5px solid ${task.done ? 'var(--color-success)' : 'var(--color-ice)'}`,
          borderRadius: 0,
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: task.done ? '0 0 8px rgba(94, 122, 82, 0.45)' : '0 0 6px rgba(143, 191, 211, 0.18)',
          transition: 'all 0.15s',
        }}
      >
        {task.done && <CheckCircle2 size={11} color="var(--color-success-light)" strokeWidth={3} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineText
          value={task.title}
          onSave={(v) => onUpdate(task.id, { title: v })}
          style={{
            color: task.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            fontFamily: 'var(--font-display)',
            fontSize: 14, fontWeight: 600,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            textDecoration: task.done ? 'line-through' : 'none',
            display: 'block',
          }}
        />
        <div style={{
          marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          fontFamily: 'var(--font-mono)',
        }}>
          {/* DATE PILL */}
          {editingDate ? (
            <input
              type="date"
              autoComplete="off"
              autoFocus
              value={task.scheduled_date ?? ''}
              onChange={e => {
                if (!isValidDateInput(e.target.value)) return
                onUpdate(task.id, { scheduled_date: e.target.value || null })
                setEditingDate(false)
              }}
              onBlur={() => setEditingDate(false)}
              style={{
                background: 'rgba(8, 12, 18, 0.85)',
                border: '1px solid var(--color-ice)',
                color: 'var(--color-ice-light)',
                fontSize: 10, padding: '3px 6px',
                outline: 'none', colorScheme: 'dark',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.05em',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
                boxShadow: '0 0 8px rgba(143, 191, 211, 0.25)',
              } as any}
            />
          ) : task.scheduled_date ? (
            <button
              onClick={() => setEditingDate(true)}
              style={{
                background: isOverdue ? 'rgba(159, 18, 57, 0.14)' : 'rgba(8, 12, 18, 0.55)',
                border: `1px solid ${isOverdue ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                color: isOverdue ? 'var(--color-accent-light)' : 'var(--color-text-tertiary)',
                fontSize: 9, fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
                boxShadow: isOverdue ? '0 0 8px rgba(159, 18, 57, 0.25)' : 'none',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ color: isOverdue ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', marginRight: 4 }}>DT</span>
              {formatDate(task.scheduled_date)}
              {isOverdue && <span style={{ marginLeft: 6 }}>· ATRASADA</span>}
            </button>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700,
                padding: '3px 4px', cursor: 'pointer',
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ice-light)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              + DATA
            </button>
          )}

          {/* TIME PILL */}
          {editingTime ? (
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
              <input
                type="time"
                autoFocus
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                onBlur={commitTime}
                onKeyDown={e => { if (e.key === 'Enter') commitTime() }}
                style={cyberInlineInput(80)}
              />
              <span style={{ color: 'var(--color-ice)', fontSize: 10 }}>→</span>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                onBlur={commitTime}
                onKeyDown={e => { if (e.key === 'Enter') commitTime() }}
                style={cyberInlineInput(80)}
              />
            </span>
          ) : timeLabel ? (
            <button
              onClick={() => setEditingTime(true)}
              style={{
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)',
                fontSize: 9, fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: '0.05em',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
              }}
            >
              <span style={{ color: 'var(--color-text-muted)', marginRight: 4, letterSpacing: '0.15em' }}>T</span>
              {timeLabel}
            </button>
          ) : (
            <button
              onClick={() => setEditingTime(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700,
                padding: '3px 4px', cursor: 'pointer',
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ice-light)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              + HORÁRIO
            </button>
          )}

          {/* DURATION PILL */}
          {editingDuration ? (
            <input
              type="text"
              autoComplete="off"
              autoFocus
              value={duration}
              onChange={e => setDuration(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={e => { if (e.key === 'Enter') commitDuration() }}
              placeholder="h:mm"
              title="Duração — aceita '1:30' ou '90' (minutos)"
              style={cyberInlineInput(70)}
            />
          ) : task.duration_minutes ? (
            <button
              onClick={() => setEditingDuration(true)}
              style={{
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)',
                fontSize: 9, fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
              }}
            >
              <span style={{ color: 'var(--color-text-muted)', marginRight: 4 }}>EST</span>
              {minutesToHmm(task.duration_minutes)}
            </button>
          ) : (
            <button
              onClick={() => setEditingDuration(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700,
                padding: '3px 4px', cursor: 'pointer',
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ice-light)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              + DURAÇÃO
            </button>
          )}

          <PrioritySelect
            value={task.priority || 'critical'}
            onChange={v => onUpdate(task.id, { priority: v })}
          />
        </div>
      </div>

      {!task.done && onSessionUpdate && (
        <RunnableControls
          runnableType="task"
          id={task.id}
          sessions={taskSessions}
          activeSession={activeSession ?? null}
          onSessionUpdate={onSessionUpdate}
        />
      )}

      <button
        onClick={async () => {
          const ok = await confirmDialog({
            title: 'Deletar tarefa',
            message: `Deletar a tarefa "${task.title}"?`,
            confirmLabel: 'DELETAR',
            danger: true,
          })
          if (ok) onDelete(task.id)
        }}
        title="deletar"
        style={{
          background: 'none', border: 'none',
          color: hover ? 'var(--color-text-tertiary)' : 'transparent',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer', padding: '4px 8px', fontSize: 14,
          flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
        onMouseLeave={e => (e.currentTarget.style.color = hover ? 'var(--color-text-tertiary)' : 'transparent')}
      >
        ✕
      </button>
    </div>
  )
}

function cyberInlineInput(width: number): React.CSSProperties {
  return {
    width,
    background: 'rgba(8, 12, 18, 0.85)',
    border: '1px solid var(--color-ice)',
    color: 'var(--color-ice-light)',
    fontSize: 10, padding: '3px 6px',
    outline: 'none', colorScheme: 'dark',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.05em',
    borderRadius: 0,
    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
    boxShadow: '0 0 8px rgba(143, 191, 211, 0.25)',
  } as React.CSSProperties
}

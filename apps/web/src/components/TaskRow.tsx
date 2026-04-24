import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { ActiveSession, Task } from '../types'
import { fetchTaskSessions, reportApiError } from '../api'
import { InlineText } from './ui/InlineText'
import { RunnableControls } from './RunnableControls'
import { PrioritySelect } from './PrioritySelect'

/**
 * Task row used in the TasksView list and in the Dia "tarefas de hoje" area.
 * Allows inline edit of title, date, time range and duration, plus toggle-done
 * and play/pause/stop via RunnableControls (when the caller wires sessions).
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
  const [duration, setDuration] = useState(task.duration_minutes ? String(task.duration_minutes) : '')
  const [taskSessions, setTaskSessions] = useState<{ started_at: string; ended_at: string | null }[]>([])

  useEffect(() => {
    fetchTaskSessions(task.id).then(setTaskSessions).catch(err => reportApiError('TaskRow', err))
  }, [task.id, sessionUpdateTrigger, activeSession?.type, activeSession?.id, activeSession?.started_at, activeSession?.ended_at])

  useEffect(() => { setStartTime(task.start_time ?? '') }, [task.start_time])
  useEffect(() => { setEndTime(task.end_time ?? '') }, [task.end_time])
  useEffect(() => { setDuration(task.duration_minutes ? String(task.duration_minutes) : '') }, [task.duration_minutes])

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
    const parsed = duration.trim() ? parseInt(duration.trim(), 10) : null
    const next = parsed && !isNaN(parsed) && parsed > 0 ? parsed : null
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

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 0', borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <button
        onClick={() => onToggle(task.id)}
        title={task.done ? 'desmarcar' : 'concluir'}
        style={{
          width: 16, height: 16, flexShrink: 0, padding: 0,
          background: task.done ? 'var(--color-success)' : 'transparent',
          border: `1.5px solid ${task.done ? 'var(--color-success)' : 'var(--color-border)'}`,
          borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s',
        }}
      >
        {task.done && <CheckCircle2 size={10} color="#fff" strokeWidth={2.5} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineText
          value={task.title}
          onSave={(v) => onUpdate(task.id, { title: v })}
          style={{
            color: task.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            fontSize: 13, fontWeight: 500,
            textDecoration: task.done ? 'line-through' : 'none',
            display: 'block',
          }}
        />
        <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {editingDate ? (
            <input
              type="date"
              autoComplete="off"
              autoFocus
              value={task.scheduled_date ?? ''}
              onChange={e => {
                onUpdate(task.id, { scheduled_date: e.target.value || null })
                setEditingDate(false)
              }}
              onBlur={() => setEditingDate(false)}
              style={{
                background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 4px',
                borderRadius: 2, outline: 'none', colorScheme: 'dark',
              } as any}
            />
          ) : task.scheduled_date ? (
            <button
              onClick={() => setEditingDate(true)}
              style={{
                background: isOverdue ? 'rgba(139, 46, 46, 0.12)' : 'none',
                border: `1px solid ${isOverdue ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                color: isOverdue ? 'var(--color-accent-primary)' : 'var(--color-text-tertiary)',
                fontSize: 10, fontWeight: isOverdue ? 700 : 400,
                padding: '2px 6px', borderRadius: 2, cursor: 'pointer',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            >
              {formatDate(task.scheduled_date)}
              {isOverdue && <span style={{ marginLeft: 6, opacity: 0.85 }}>· atrasada</span>}
            </button>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--color-text-muted)', fontSize: 10,
                padding: '2px 4px', cursor: 'pointer', fontStyle: 'italic',
              }}
            >
              + data
            </button>
          )}

          {editingTime ? (
            <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
              <input
                type="time"
                autoFocus
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                onBlur={commitTime}
                onKeyDown={e => { if (e.key === 'Enter') commitTime() }}
                style={{
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 4px',
                  borderRadius: 2, outline: 'none', colorScheme: 'dark', width: 75,
                } as any}
              />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>–</span>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                onBlur={commitTime}
                onKeyDown={e => { if (e.key === 'Enter') commitTime() }}
                style={{
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 4px',
                  borderRadius: 2, outline: 'none', colorScheme: 'dark', width: 75,
                } as any}
              />
            </span>
          ) : timeLabel ? (
            <button
              onClick={() => setEditingTime(true)}
              style={{
                background: 'none', border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)', fontSize: 10,
                padding: '2px 6px', borderRadius: 2, cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              {timeLabel}
            </button>
          ) : (
            <button
              onClick={() => setEditingTime(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--color-text-muted)', fontSize: 10,
                padding: '2px 4px', cursor: 'pointer', fontStyle: 'italic',
              }}
            >
              + horário
            </button>
          )}

          {editingDuration ? (
            <input
              type="number"
              autoComplete="off"
              min={1}
              autoFocus
              value={duration}
              onChange={e => setDuration(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={e => { if (e.key === 'Enter') commitDuration() }}
              placeholder="min"
              style={{
                background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', fontSize: 10, padding: '2px 4px',
                borderRadius: 2, outline: 'none', width: 60,
              }}
            />
          ) : task.duration_minutes ? (
            <button
              onClick={() => setEditingDuration(true)}
              style={{
                background: 'none', border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)', fontSize: 10,
                padding: '2px 6px', borderRadius: 2, cursor: 'pointer',
              }}
            >
              ~{task.duration_minutes}min
            </button>
          ) : (
            <button
              onClick={() => setEditingDuration(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--color-text-muted)', fontSize: 10,
                padding: '2px 4px', cursor: 'pointer', fontStyle: 'italic',
              }}
            >
              + duração
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
        onClick={() => {
          if (window.confirm(`Deletar tarefa "${task.title}"?`)) onDelete(task.id)
        }}
        title="deletar"
        style={{
          background: 'none', border: 'none',
          color: hover ? 'var(--color-text-tertiary)' : 'transparent',
          cursor: 'pointer', padding: '4px 8px', fontSize: 14,
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

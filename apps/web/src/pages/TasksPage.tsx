import { useEffect, useState } from 'react'
import type { ActiveSession, Task } from '../types'
import { createTask, updateTask, toggleTask, deleteTask } from '../api'
import { useTasks, useAppInvalidator } from '../lib/app-queries'
import { tabSync } from '../lib/tabsync'
import type { DateRange } from '../utils/dateRange'
import { computeRange, isInRange } from '../utils/dateRange'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { TaskRow } from '../components/TaskRow'
import { PrioritySelect } from '../components/PrioritySelect'
import { parseTimeToMinutes } from '../utils/datetime'
import { PageShell, TechId } from '../components/ui/CyberShell'
import { CyberDatePicker } from '../components/ui/CyberDatePicker'
import { CyberTimePicker } from '../components/ui/CyberTimePicker'
import { alertDialog } from '../lib/dialog'

type TaskFilter = 'all' | 'today' | 'no-date'

/** Wrapper de label mono `// XYZ` + child input/picker. */
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, fontWeight: 700,
        color: 'var(--color-text-muted)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * `/tarefas` — CRUD de tarefas standalone (não vinculadas a quest). Formulário
 * de criação expansível com detalhes (data, horários, duração), filtros
 * "Todas / Hoje / Sem data" e seção retrátil de concluídas com
 * `DateRangeFilter`.
 */
export function TasksView({ activeSession, onSessionUpdate, sessionUpdateTrigger = 0 }: {
  activeSession?: ActiveSession | null
  onSessionUpdate?: () => void
  sessionUpdateTrigger?: number
}) {
  // Tasks via React Query — substituiu useState + fetchTasks manual.
  const tasksQ = useTasks()
  const tasks: Task[] = tasksQ.data ?? []
  const appInv = useAppInvalidator()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [newTitle, setNewTitle] = useState('')
  const todayYmd = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const [newDate, setNewDate] = useState<string>(todayYmd)
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [newDuration, setNewDuration] = useState('')
  const [newPriority, setNewPriority] = useState('critical')
  const [showExtras, setShowExtras] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [doneRange, setDoneRange] = useState<DateRange>(() => computeRange('7d'))

  // Quando sessão muda no resto do app, invalida tasks pra refletir mudança
  // de `done` ou duração agregada. (Fetch inicial é feito pelo useTasks.)
  useEffect(() => {
    if (!sessionUpdateTrigger) return
    appInv.tasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUpdateTrigger])

  const todayIso = todayYmd

  const active = tasks.filter(t => !t.done)
  const filtered = active.filter(t => {
    if (filter === 'today') return t.scheduled_date === todayIso
    if (filter === 'no-date') return !t.scheduled_date
    return true
  })
  const doneAll = tasks.filter(t => t.done)
  const doneFiltered = doneAll.filter(t => isInRange(t.completed_at, doneRange))

  // Regra: toda tarefa precisa ter OU duração OU horário (início + fim), pra
  // caber em algum lugar do dia. Sem isso, não dá pra estimar carga.
  const hasRange = !!(newStartTime && newEndTime)
  const parsedDuration = parseTimeToMinutes(newDuration)
  const hasDuration = !!parsedDuration && parsedDuration > 0
  const timeOK = hasRange || hasDuration
  const canCreate = !!newTitle.trim() && timeOK

  async function handleCreate() {
    const title = newTitle.trim()
    if (!title) return
    if (!timeOK) {
      // Abre detalhes pra usuário preencher o campo que falta.
      setShowExtras(true)
      alertDialog({ title: 'Tempo obrigatório', message: 'Preencha a duração em minutos OU os horários de início e fim.', variant: 'warning' })
      return
    }
    try {
      await createTask({
        title,
        priority: newPriority,
        scheduled_date: newDate || null,
        start_time: newStartTime || null,
        end_time: newEndTime || null,
        duration_minutes: hasDuration ? parsedDuration : null,
      })
      appInv.tasks(); tabSync.emit('tasks')
      setNewTitle('')
      setNewDate(todayYmd)
      setNewStartTime('')
      setNewEndTime('')
      setNewDuration('')
      setNewPriority('critical')
      setShowExtras(false)
    } catch {
      alertDialog({ title: 'Erro', message: 'Erro ao criar tarefa', variant: 'danger' })
    }
  }

  async function handleToggle(id: string) {
    try {
      await toggleTask(id)
      appInv.tasks(); tabSync.emit('tasks')
      // Avisa o App pra refazer o fetch da sessão ativa — sem isso o banner
      // continua mostrando esta task como "pausada" até o próximo polling de
      // 15s, mesmo após ser marcada como done.
      onSessionUpdate?.()
    } catch {}
  }

  async function handleUpdate(id: string, patch: Partial<Task>) {
    try {
      await updateTask(id, patch as any)
      appInv.tasks(); tabSync.emit('tasks')
    } catch {
      alertDialog({ title: 'Erro', message: 'Erro ao atualizar tarefa', variant: 'danger' })
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id)
      appInv.tasks(); tabSync.emit('tasks')
    } catch {
      alertDialog({ title: 'Erro', message: 'Erro ao deletar tarefa', variant: 'danger' })
    }
  }

  const filterButtons: { key: TaskFilter; label: string }[] = [
    { key: 'all', label: 'TODAS' },
    { key: 'today', label: 'HOJE' },
    { key: 'no-date', label: 'SEM DATA' },
  ]

  return (
    <PageShell
      headerLabel="TAREFAS"
      headerLeftContent={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14, fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
            lineHeight: 1.1,
          }}>
            {active.length} {active.length === 1 ? 'ATIVA' : 'ATIVAS'} · {doneAll.length} {doneAll.length === 1 ? 'CONCLUÍDA' : 'CONCLUÍDAS'}
          </span>
          <TechId>TASK.QUEUE</TechId>
        </div>
      }
      footerCaption={
        <>
          <div>// TASK.PIPELINE · {active.length} ACTIVE / {doneAll.length} DONE</div>
          <div style={{ opacity: 0.6, marginTop: 2 }}>TYPE: TACTICAL.TASKS</div>
        </>
      }
    >

      {/* Criar tarefa — container chamferado cyber */}
      <section style={{ marginTop: 28 }}>
        <div style={{
          padding: '14px 16px',
          background: 'rgba(8, 12, 18, 0.55)',
          border: '1px solid var(--color-ice-deep)',
          borderRadius: 0,
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, fontWeight: 700,
            color: 'var(--color-ice-light)',
            letterSpacing: '0.22em', textTransform: 'uppercase',
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div
              aria-hidden="true"
              style={{
                width: 3, height: 12,
                background: 'var(--color-ice)',
                boxShadow: '0 0 6px var(--color-ice-glow)',
              }}
            />
            <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
            NEW.TASK
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !showExtras) handleCreate() }}
              placeholder="título da tarefa…"
              style={{
                flex: '1 1 200px', minWidth: 180,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--color-ice-deep)',
                color: 'var(--color-ice-light)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                padding: '6px 2px', fontSize: 13,
                letterSpacing: '0.02em',
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-ice)')}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--color-ice-deep)')}
            />
            <PrioritySelect value={newPriority} onChange={setNewPriority} />
            <button
              onClick={() => setShowExtras(o => !o)}
              title={showExtras ? 'ocultar detalhes' : 'adicionar detalhes'}
              style={{
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700,
                padding: '5px 10px',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                letterSpacing: '0.22em', textTransform: 'uppercase',
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
              {showExtras ? '− DETALHES' : '+ DETALHES'}
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              title={
                !newTitle.trim() ? 'Preencha o título'
                : !timeOK ? 'Preencha a duração ou os horários início/fim'
                : undefined
              }
              style={{
                background: canCreate ? 'rgba(143, 191, 211, 0.14)' : 'rgba(8, 12, 18, 0.55)',
                border: `1px solid ${canCreate ? 'var(--color-ice)' : 'var(--color-border)'}`,
                color: canCreate ? 'var(--color-ice-light)' : 'var(--color-text-muted)',
                cursor: canCreate ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 700,
                padding: '6px 14px',
                letterSpacing: '0.22em', textTransform: 'uppercase',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)',
                boxShadow: canCreate ? '0 0 12px rgba(143, 191, 211, 0.25)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              ✓ CRIAR
            </button>
          </div>
          {showExtras && (
            <div style={{
              display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14,
              paddingTop: 12, borderTop: '1px dashed rgba(143, 191, 211, 0.22)',
            }}>
              <FieldLabel label="DATA">
                <CyberDatePicker value={newDate} onChange={setNewDate} width={140} />
              </FieldLabel>
              <FieldLabel label="INÍCIO">
                <CyberTimePicker value={newStartTime} onChange={setNewStartTime} width={100} />
              </FieldLabel>
              <FieldLabel label="FIM">
                <CyberTimePicker value={newEndTime} onChange={setNewEndTime} width={100} />
              </FieldLabel>
              <FieldLabel label="DURAÇÃO">
                <input
                  type="text"
                  autoComplete="off"
                  value={newDuration}
                  placeholder="h:mm"
                  title="Aceita '1:30' ou '90' (minutos)"
                  onChange={e => setNewDuration(e.target.value)}
                  style={{
                    width: 90,
                    background: 'rgba(8, 12, 18, 0.55)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-ice-light)',
                    fontSize: 11, padding: '5px 9px',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    borderRadius: 0,
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                    transition: 'all 0.15s',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--color-ice)'
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(143, 191, 211, 0.30)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </FieldLabel>
            </div>
          )}
        </div>
      </section>

      {/* Filter pills cyber */}
      <section style={{ marginTop: 28 }}>
        <div style={{
          display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap',
          paddingBottom: 8,
          borderBottom: '1px solid var(--color-ice-deep)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, fontWeight: 700,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.22em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', marginRight: 4,
          }}>
            <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
            FILTER
          </div>
          {filterButtons.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  background: active ? 'rgba(143, 191, 211, 0.14)' : 'rgba(8, 12, 18, 0.55)',
                  border: `1px solid ${active ? 'var(--color-ice)' : 'var(--color-border)'}`,
                  cursor: 'pointer',
                  color: active ? 'var(--color-ice-light)' : 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, fontWeight: 700,
                  padding: '5px 12px',
                  letterSpacing: '0.22em', textTransform: 'uppercase',
                  borderRadius: 0,
                  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                  boxShadow: active ? '0 0 10px rgba(143, 191, 211, 0.25)' : 'none',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (active) return
                  e.currentTarget.style.color = 'var(--color-ice-light)'
                  e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                }}
                onMouseLeave={e => {
                  if (active) return
                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 700,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '14px 16px',
            border: '1px dashed rgba(143, 191, 211, 0.30)',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
          }}>
            <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
            {filter === 'today' ? 'NENHUMA TAREFA PRA HOJE'
              : filter === 'no-date' ? 'NENHUMA TAREFA SEM DATA'
              : 'NENHUMA TAREFA REGISTRADA · CRIE UMA ACIMA'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(t => (
              <TaskRow key={t.id} task={t} onToggle={handleToggle} onUpdate={handleUpdate} onDelete={handleDelete} activeSession={activeSession} onSessionUpdate={onSessionUpdate} sessionUpdateTrigger={sessionUpdateTrigger} />
            ))}
          </div>
        )}
      </section>

      {doneAll.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowDone(o => !o)}
              style={{
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid rgba(94, 122, 82, 0.45)',
                cursor: 'pointer',
                color: 'var(--color-success-light)',
                fontFamily: 'var(--font-mono)',
                fontSize: 9, fontWeight: 700,
                padding: '5px 10px',
                letterSpacing: '0.22em', textTransform: 'uppercase',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(94, 122, 82, 0.14)'
                e.currentTarget.style.boxShadow = '0 0 10px rgba(94, 122, 82, 0.25)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(8, 12, 18, 0.55)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <span style={{ fontSize: 9 }}>{showDone ? '▼' : '▶'}</span>
              <span style={{ color: 'var(--color-success)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
              {doneFiltered.length.toString().padStart(2, '0')} {doneFiltered.length === 1 ? 'CONCLUÍDA' : 'CONCLUÍDAS'}
            </button>
            <DateRangeFilter value={doneRange} onChange={setDoneRange} />
          </div>
          {showDone && doneFiltered.length > 0 && (
            <div style={{ marginTop: 12, opacity: 0.55, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {doneFiltered.map(t => (
                <TaskRow key={t.id} task={t} onToggle={handleToggle} onUpdate={handleUpdate} onDelete={handleDelete} activeSession={activeSession} onSessionUpdate={onSessionUpdate} sessionUpdateTrigger={sessionUpdateTrigger} />
              ))}
            </div>
          )}
          {showDone && doneFiltered.length === 0 && (
            <div style={{
              marginTop: 12,
              fontFamily: 'var(--font-mono)',
              fontSize: 9, fontWeight: 700,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>
              <span style={{ color: 'var(--color-success)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
              NENHUMA CONCLUÍDA NO PERÍODO ({doneAll.length} NO TOTAL)
            </div>
          )}
        </section>
      )}

    </PageShell>
  )
}

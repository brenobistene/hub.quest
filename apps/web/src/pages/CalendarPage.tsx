import { useEffect, useRef, useState } from 'react'
import type { Area, Project, Quest, Routine, Task } from '../types'
import { fetchAllRoutines, fetchSessions, fetchTasks, fetchTaskSessions, fetchRoutineSessions, deleteRoutine, reportApiError } from '../api'
import { parseIsoAsUtc } from '../utils/datetime'
import { getAreaColor } from '../utils/quests'
import type { UnproductiveBlock } from '../utils/blocks'
import { getAllBlockRangesForDay } from '../utils/blocks'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAY_NAMES   = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

function pyDayToJs(py: number) { return (py + 1) % 7 }

function routineMatchesDay(r: Routine, jsDay: number): boolean {
  if (r.recurrence === 'daily') return true
  if (r.recurrence === 'weekdays') return jsDay >= 1 && jsDay <= 5
  if (r.recurrence === 'weekly') return pyDayToJs(r.day_of_week ?? -1) === jsDay
  return false
}

/**
 * `/calendario` — visão dia/semana/mês/ano. O modo "dia" e "semana" renderizam
 * um timeline 24h com sessões de quests (via `fetchSessions`), rotinas com
 * horário fixo, e blocos improdutivos (`hq-unproductive-blocks`, cross-midnight
 * via `getAllBlockRangesForDay`). Clicar num slot abre o modal de edição de
 * bloco improdutivo.
 */
export function CalendarView({ projects, quests, areas, sessionUpdateTrigger }: { projects: Project[]; quests: Quest[]; areas: Area[]; sessionUpdateTrigger: number }) {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [viewMode, setViewMode] = useState<'dia' | 'semana' | 'mês' | 'ano'>('dia')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [allSessions, setAllSessions] = useState<Map<string, any[]>>(new Map())
  const [tasks, setTasks] = useState<Task[]>([])
  const [allTaskSessions, setAllTaskSessions] = useState<Map<string, any[]>>(new Map())
  const [allRoutineSessions, setAllRoutineSessions] = useState<Map<string, any[]>>(new Map())
  const [currentTime] = useState(new Date())
  const [timelineZoom, setTimelineZoom] = useState(1)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [unproductiveBlocks, setUnproductiveBlocks] = useState<UnproductiveBlock[]>(() => {
    const saved = localStorage.getItem('hq-unproductive-blocks')
    if (saved) return JSON.parse(saved)
    return []
  })
  const [editingBlock, setEditingBlock] = useState<UnproductiveBlock | null>(null)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [isCreatingBlock, setIsCreatingBlock] = useState(false)
  // Data específica que o user clicou (YYYY-MM-DD) — define o escopo do "apenas
  // este evento" / "este e seguintes". Vazio quando criando bloco novo.
  const [editingBlockDate, setEditingBlockDate] = useState<string | null>(null)
  const [blockScope, setBlockScope] = useState<'this' | 'following' | 'all'>('all')
  // Popup de "Aplicar a" — só aparece depois que o user clica Salvar/Excluir
  // em um bloco recorrente. Action define o branch (commit ou remover).
  const [showScopePopup, setShowScopePopup] = useState(false)
  const [scopeAction, setScopeAction] = useState<'save' | 'delete'>('save')

  useEffect(() => {
    localStorage.setItem('hq-unproductive-blocks', JSON.stringify(unproductiveBlocks))
  }, [unproductiveBlocks])

  useEffect(() => {
    fetchAllRoutines().then(setRoutines).catch(err => reportApiError('CalendarPage', err))
  }, [])

  useEffect(() => {
    Promise.all(quests.map(q => fetchSessions(q.id).then(sessions => ({ questId: q.id, sessions })).catch(() => ({ questId: q.id, sessions: [] }))))
      .then(results => {
        const map = new Map()
        results.forEach(({ questId, sessions }) => {
          map.set(questId, sessions)
        })
        setAllSessions(map)
      })
  }, [quests, sessionUpdateTrigger])

  // Tasks: fetch list + sessões pra renderizar no timeline.
  useEffect(() => {
    fetchTasks().then(setTasks).catch(err => reportApiError('CalendarPage', err))
  }, [sessionUpdateTrigger])

  useEffect(() => {
    Promise.all(tasks.map(t => fetchTaskSessions(t.id)
      .then(sessions => ({ taskId: t.id, sessions }))
      .catch(() => ({ taskId: t.id, sessions: [] as any[] }))))
      .then(results => {
        const map = new Map<string, any[]>()
        results.forEach(({ taskId, sessions }) => { map.set(taskId, sessions) })
        setAllTaskSessions(map)
      })
  }, [tasks, sessionUpdateTrigger])

  // Routines: sessões por routine (depende da data visível pois a API pede target).
  useEffect(() => {
    const iso = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`
    Promise.all(routines.map(r => fetchRoutineSessions(r.id, iso)
      .then(sessions => ({ routineId: r.id, sessions }))
      .catch(() => ({ routineId: r.id, sessions: [] as any[] }))))
      .then(results => {
        const map = new Map<string, any[]>()
        results.forEach(({ routineId, sessions }) => { map.set(routineId, sessions) })
        setAllRoutineSessions(map)
      })
  }, [routines, currentDate, sessionUpdateTrigger])

  const todayIso = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })()

  const dateIso = (() => {
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`
  })()

  const dateLabel = currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  function questsForDay(iso: string) {
    return quests.filter(q => q.deadline === iso && q.status !== 'done')
  }

  function routinesForDay(iso: string) {
    const jsDay = new Date(iso + 'T12:00:00').getDay()
    return routines.filter(r => routineMatchesDay(r, jsDay))
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto', color: 'var(--color-text-primary)' }}>
      <header style={{
        display: 'flex', alignItems: 'flex-end', gap: 14,
        paddingBottom: 20, borderBottom: '1px solid var(--color-divider)',
        marginBottom: 24,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--color-text-tertiary)',
            letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
            marginBottom: 4,
          }}>
            Calendário
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
            color: 'var(--color-text-primary)', lineHeight: 1.2,
            textTransform: 'capitalize',
          }}>
            {viewMode === 'dia' ? 'Visão do dia' : viewMode === 'semana' ? 'Visão da semana' : viewMode === 'mês' ? 'Visão do mês' : 'Visão do ano'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['dia', 'semana', 'mês', 'ano'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: viewMode === mode ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontSize: 10, fontWeight: viewMode === mode ? 700 : 500,
                padding: '6px 12px', textTransform: 'uppercase',
                letterSpacing: '0.1em',
                borderBottom: viewMode === mode ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (viewMode !== mode) e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseLeave={e => { if (viewMode !== mode) e.currentTarget.style.color = 'var(--color-text-muted)' }}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>

      {viewMode === 'dia' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() - 86400000))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >←</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500 }}>{dateLabel}</div>
              <button
                onClick={() => setCurrentDate(new Date())}
                style={{
                  background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                  color: 'var(--color-text-secondary)', fontSize: 10, padding: '4px 10px', lineHeight: 1,
                  textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                  borderRadius: 3, transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                  e.currentTarget.style.color = 'var(--color-accent-light)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }}
              >hoje</button>
            </div>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() + 86400000))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >→</button>
          </div>

          <div style={{
            display: 'flex',
            gap: 20,
            marginBottom: 16,
            padding: '12px 8px',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'var(--color-accent-light)', borderRadius: 2 }} />
              <span>Quests</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'var(--color-gold)', borderRadius: 2 }} />
              <span>Tarefas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'var(--color-routine-block)', borderRadius: 2 }} />
              <span>Rotinas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'rgba(107, 100, 96, 0.3)', border: '1px solid var(--color-text-muted)', borderRadius: 2 }} />
              <span>Improdutivo</span>
            </div>
          </div>

          <div style={{ overflow: 'auto', height: '80vh' }}>
            {(() => {
              const dayProjects = projects.filter(p => p.deadline === dateIso && !p.archived_at)
              if (!dayProjects.length) return null
              return (
                <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', padding: '2px 8px', marginBottom: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {dayProjects.map(q => (
                    <span key={q.id} style={{ fontSize: 13, color: 'var(--color-accent-light)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent-light)33', borderRadius: 3, padding: '4px 10px' }}>
                      📋 {q.title}
                    </span>
                  ))}
                </div>
              )
            })()}

            <div
              ref={timelineRef}
              onWheel={(e) => {
                if (e.shiftKey || (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  setTimelineZoom(prev => {
                    const newZoom = e.deltaY > 0 ? prev - 0.2 : prev + 0.2
                    return Math.max(0.5, Math.min(3, newZoom))
                  })
                }
              }}
              style={{ display: 'flex', gap: 0 }}
            >
              <div style={{ width: 50, flexShrink: 0, paddingTop: 20 }}>
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div
                    key={hour}
                    style={{
                      height: 60 * timelineZoom,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      paddingRight: 8,
                      fontSize: 10,
                      color: 'var(--color-text-muted)',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--color-border)', paddingTop: 20 }}>
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div
                    key={hour}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const clickY = e.clientY - rect.top
                      const hourOffset = clickY / (60 * timelineZoom)
                      const clickedHour = hour + hourOffset

                      const newBlock: UnproductiveBlock = {
                        id: Date.now().toString(),
                        title: 'Novo Evento',
                        start: Math.round(clickedHour * 2) / 2,
                        end: Math.round((clickedHour * 2 + 1)) / 2,
                        recurrence: 'none',
                        endsOn: 'never',
                        effectiveFrom: dateIso,
                        effectiveUntil: dateIso,
                      }
                      setEditingBlock(newBlock)
                      setEditingBlockDate(null)
                      setBlockScope('all')
                      setIsCreatingBlock(true)
                      setShowBlockModal(true)
                    }}
                    style={{
                      height: 60 * timelineZoom,
                      borderBottom: '1px solid var(--color-divider)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(196, 106, 90, 0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  />
                ))}

                {dateIso === todayIso && (
                  <div
                    style={{
                      position: 'absolute',
                      top: `${20 + (currentTime.getHours() + currentTime.getMinutes() / 60) * 60 * timelineZoom}px`,
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: 'var(--color-accent-light)',
                      zIndex: 100,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {getAllBlockRangesForDay(unproductiveBlocks, currentDate).map((r, idx) => {
                  const topPercent = 20 + r.start * 60 * timelineZoom
                  const heightPercent = (r.end - r.start) * 60 * timelineZoom
                  const bgColor = r.block.title.toLowerCase().includes('dorm') ? 'rgba(75, 85, 102, 0.3)' : 'rgba(107, 100, 96, 0.25)'

                  return (
                    <div
                      key={`unproductive-${r.block.id}-${idx}`}
                      onClick={() => {
                        setEditingBlock(r.block)
                        setEditingBlockDate(dateIso)
                        setBlockScope('this')
                        setShowBlockModal(true)
                      }}
                      style={{
                        position: 'absolute',
                        left: '0',
                        right: '0',
                        top: `${topPercent}px`,
                        height: `${Math.max(20, heightPercent)}px`,
                        background: bgColor,
                        borderLeft: `2px solid var(--color-text-muted)`,
                        zIndex: 1,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = bgColor.replace('0.3', '0.5').replace('0.25', '0.4')
                        e.currentTarget.style.borderLeft = '2px solid var(--color-accent-light)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = bgColor
                        e.currentTarget.style.borderLeft = '2px solid var(--color-text-muted)'
                      }}
                      title={`${r.block.title} - Clique para editar`}
                    >
                      {heightPercent > 20 && (
                        <div style={{
                          fontSize: 8,
                          color: 'var(--color-text-muted)',
                          padding: '2px 4px',
                          fontStyle: 'italic',
                          opacity: 0.6,
                        }}>
                          {r.block.title}
                        </div>
                      )}
                    </div>
                  )
                })}

                {quests.map((quest) => {
                  const sessions = allSessions.get(quest.id) || []
                  const todaySessions = sessions.filter(s => {
                    const start = parseIsoAsUtc(s.started_at)
                    const startDate = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`
                    return startDate === dateIso
                  })
                  const parentQuest = quest.project_id ? projects.find(p => p.id === quest.project_id) : null

                  return todaySessions.map((session, idx) => {
                    const start = parseIsoAsUtc(session.started_at)
                    const end = session.ended_at ? parseIsoAsUtc(session.ended_at) : new Date()
                    const startHour = start.getHours() + start.getMinutes() / 60
                    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                    const topPercent = 20 + (startHour % 24) * 60 * timelineZoom
                    const heightPercent = Math.max(15, duration * 60 * timelineZoom)
                    const displayTitle = parentQuest ? `${parentQuest.title} > ${quest.title}` : quest.title

                    return (
                      <div
                        key={`${quest.id}-${idx}`}
                        style={{
                          position: 'absolute',
                          left: '4px',
                          right: '4px',
                          top: `${topPercent}px`,
                          height: `${heightPercent}px`,
                          background: getAreaColor(quest.area_slug, areas),
                          borderRadius: 3,
                          padding: '4px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          opacity: 0.85,
                          transition: 'opacity 0.15s, box-shadow 0.15s',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.opacity = '1'
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.opacity = '0.85'
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
                        }}
                      >
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 600, lineHeight: 1.2, wordBreak: 'break-word' }}>
                          {displayTitle.substring(0, 35)}
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>
                          {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          {end && ` → ${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                        </div>
                      </div>
                    )
                  })
                })}

                {/* Sessões de TAREFAS (play/pause/stop → blocos no timeline) */}
                {tasks.map((task) => {
                  const sessions = allTaskSessions.get(task.id) || []
                  const todaySessions = sessions.filter(s => {
                    if (!s?.started_at) return false
                    const st = parseIsoAsUtc(s.started_at)
                    const stDate = `${st.getFullYear()}-${String(st.getMonth()+1).padStart(2,'0')}-${String(st.getDate()).padStart(2,'0')}`
                    return stDate === dateIso
                  })
                  return todaySessions.map((session, idx) => {
                    const start = parseIsoAsUtc(session.started_at)
                    const end = session.ended_at ? parseIsoAsUtc(session.ended_at) : new Date()
                    const startHour = start.getHours() + start.getMinutes() / 60
                    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                    const topPercent = 20 + (startHour % 24) * 60 * timelineZoom
                    const heightPercent = Math.max(15, duration * 60 * timelineZoom)
                    const running = !session.ended_at
                    return (
                      <div
                        key={`task-sess-${task.id}-${idx}`}
                        title={`${task.title} · ${running ? 'rodando' : 'finalizada'}`}
                        style={{
                          position: 'absolute', left: '4px', right: '4px',
                          top: `${topPercent}px`, height: `${heightPercent}px`,
                          background: 'var(--color-gold)',
                          border: running ? '1px dashed #fff' : '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 3, padding: '4px',
                          overflow: 'hidden',
                          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          opacity: 0.85,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                      >
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 600, lineHeight: 1.2 }}>
                          {task.title.substring(0, 35)}
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>
                          {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          {` → ${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                        </div>
                      </div>
                    )
                  })
                })}

                {/* Sessões de ROTINAS (play/pause/stop real, separado do horário fixo agendado) */}
                {routines.map((routine) => {
                  const sessions = allRoutineSessions.get(routine.id) || []
                  return sessions.map((session, idx) => {
                    if (!session?.started_at) return null
                    const start = parseIsoAsUtc(session.started_at)
                    const end = session.ended_at ? parseIsoAsUtc(session.ended_at) : new Date()
                    const startHour = start.getHours() + start.getMinutes() / 60
                    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
                    const topPercent = 20 + (startHour % 24) * 60 * timelineZoom
                    const heightPercent = Math.max(15, duration * 60 * timelineZoom)
                    const running = !session.ended_at
                    return (
                      <div
                        key={`routine-sess-${routine.id}-${idx}`}
                        title={`${routine.title} · ${running ? 'rodando' : 'finalizada'}`}
                        style={{
                          position: 'absolute', left: '4px', right: '4px',
                          top: `${topPercent}px`, height: `${heightPercent}px`,
                          background: 'var(--color-routine-block)',
                          border: running ? '1px dashed #fff' : '1px solid var(--color-routine-block-border)',
                          borderRadius: 3, padding: '4px',
                          overflow: 'hidden',
                          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          opacity: 0.9,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                      >
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 600, lineHeight: 1.2 }}>
                          {routine.title.substring(0, 35)}
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>
                          {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          {` → ${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                        </div>
                      </div>
                    )
                  })
                })}

                {routinesForDay(dateIso).map((routine) => {
                  if (!routine.start_time || !routine.end_time) return null

                  const [startHours, startMinutes] = routine.start_time.split(':').map(Number)
                  const [endHours, endMinutes] = routine.end_time.split(':').map(Number)

                  const startTotal = startHours + startMinutes / 60
                  const endTotal = endHours + endMinutes / 60
                  const duration = endTotal - startTotal

                  const topPercent = 20 + startTotal * 60 * timelineZoom
                  const heightPercent = Math.max(15, duration * 60 * timelineZoom)

                  return (
                    <div
                      key={routine.id}
                      style={{
                        position: 'absolute',
                        left: '4px',
                        right: '4px',
                        top: `${topPercent}px`,
                        height: `${heightPercent}px`,
                        background: 'var(--color-routine-block)',
                        borderRadius: 3,
                        border: '1px solid var(--color-routine-block-border)',
                        padding: '4px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        opacity: routine.done ? 0.5 : 0.85,
                        transition: 'opacity 0.15s, box-shadow 0.15s',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.opacity = routine.done ? '0.6' : '1'
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.4)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.opacity = routine.done ? '0.5' : '0.85'
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)'
                      }}
                    >
                      <div style={{
                        fontSize: 9,
                        color: routine.done ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                        fontWeight: 500,
                        lineHeight: 1,
                        textDecoration: routine.done ? 'line-through' : 'none',
                      }}>
                        {routine.title.substring(0, 25)}
                      </div>
                      <div style={{
                        fontSize: 7,
                        color: routine.done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                        marginTop: 2,
                      }}>
                        {routine.start_time} – {routine.end_time}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Excluir rotina "${routine.title}"?`)) {
                            deleteRoutine(routine.id)
                              .then(() => setRoutines(rs => rs.filter(r => r.id !== routine.id)))
                              .catch(() => alert('Erro ao excluir rotina'))
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          fontSize: '10px',
                          padding: '2px 4px',
                          opacity: 0.6,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                        title="Excluir rotina"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'semana' && (() => {
        const weekStart = new Date(currentDate.getTime() - ((currentDate.getDay() - 1 + 7) % 7) * 86400000)
        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const weekStartStripped = new Date(weekStart); weekStartStripped.setHours(0, 0, 0, 0)
        const isCurrentWeek = todayStart.getTime() >= weekStartStripped.getTime()
          && todayStart.getTime() <= weekStartStripped.getTime() + 6 * 86400000
        const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
        return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() - 604800000))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >←</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                {fmtDay(weekStart)} – {fmtDay(weekEnd)}
              </div>
              <button
                onClick={() => setCurrentDate(new Date())}
                disabled={isCurrentWeek}
                style={{
                  background: 'none', border: '1px solid var(--color-border)',
                  cursor: isCurrentWeek ? 'default' : 'pointer',
                  color: isCurrentWeek ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                  fontSize: 10, padding: '4px 10px', lineHeight: 1,
                  textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                  borderRadius: 3, transition: 'all 0.2s',
                  opacity: isCurrentWeek ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  if (isCurrentWeek) return
                  e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                  e.currentTarget.style.color = 'var(--color-accent-light)'
                }}
                onMouseLeave={e => {
                  if (isCurrentWeek) return
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }}
              >esta semana</button>
            </div>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() + 604800000))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >→</button>
          </div>

          <div style={{
            display: 'flex',
            gap: 20,
            marginBottom: 16,
            padding: '12px 8px',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'var(--color-routine-block)', borderRadius: 2 }} />
              <span>Rotinas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'var(--color-accent-light)', borderRadius: 2 }} />
              <span>Quests</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, background: 'rgba(107, 100, 96, 0.3)', border: '1px solid var(--color-text-muted)', borderRadius: 2 }} />
              <span>Improdutivo</span>
            </div>
          </div>

          <div style={{ overflow: 'auto', height: '85vh' }}>
            <div
              onWheel={(e) => {
                if (e.shiftKey || (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  setTimelineZoom(prev => {
                    const newZoom = e.deltaY > 0 ? prev - 0.2 : prev + 0.2
                    return Math.max(0.5, Math.min(3, newZoom))
                  })
                }
              }}
              style={{ display: 'flex', gap: 0, overflow: 'auto' }}
          >
            <div style={{ width: 50, flexShrink: 0, paddingTop: 40 }}>
              {Array.from({ length: 24 }).map((_, hour) => (
                <div
                  key={hour}
                  style={{
                    height: 40 * timelineZoom,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    paddingRight: 8,
                    fontSize: 9,
                    color: 'var(--color-text-tertiary)',
                    borderBottom: '1px solid var(--color-bg-primary)',
                  }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {Array.from({ length: 7 }).map((_, dayIdx) => {
              const dayDate = new Date(currentDate)
              dayDate.setDate(dayDate.getDate() - (currentDate.getDay() - 1 + 7) % 7 + dayIdx)
              const dayIso = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`
              const dayName = dayDate.toLocaleDateString('pt-BR', { weekday: 'short' })
              const dayNum = dayDate.getDate()
              const dayRoutines = routinesForDay(dayIso)
              const isToday = dayIso === todayIso

              return (
                <div
                  key={dayIso}
                  style={{
                    flex: 1,
                    minWidth: 120,
                    borderLeft: dayIdx === 0 ? '1px solid var(--color-border)' : '1px solid var(--color-bg-primary)',
                    borderRight: dayIdx === 6 ? '1px solid var(--color-border)' : undefined,
                    position: 'relative',
                    background: isToday ? 'rgba(200, 169, 122, 0.03)' : 'transparent',
                  }}
                >
                  <button
                    onClick={() => { setCurrentDate(dayDate); setViewMode('dia') }}
                    title={`ver ${dayName} ${dayNum} na visão dia`}
                    style={{
                      position: 'sticky',
                      top: 0,
                      width: '100%',
                      background: isToday ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                      padding: '8px 4px',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'center',
                      fontSize: 10,
                      color: isToday
                        ? 'var(--color-bg-primary)'
                        : 'var(--color-text-primary)',
                      fontWeight: isToday ? 700 : 500,
                      zIndex: 10,
                      cursor: 'pointer',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1 }}>
                      {dayName}
                    </div>
                    <div>{dayNum}</div>
                  </button>

                  {(() => {
                    const dayProjects = projects.filter(p => p.deadline === dayIso && !p.archived_at)
                    if (!dayProjects.length) return null
                    return (
                      <div style={{ position: 'sticky', top: 40, zIndex: 10, background: 'var(--color-bg-tertiary)', padding: '1px 2px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {dayProjects.map(q => (
                          <div key={q.id} style={{ fontSize: 11, color: 'var(--color-accent-light)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent-light)33', borderRadius: 3, padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📋 {q.title}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div
                      key={hour}
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const clickY = e.clientY - rect.top
                        const hourOffset = clickY / (40 * timelineZoom)
                        const clickedHour = hour + hourOffset

                        const newBlock: UnproductiveBlock = {
                          id: Date.now().toString(),
                          title: 'Novo Evento',
                          start: Math.round(clickedHour * 2) / 2,
                          end: Math.round((clickedHour * 2 + 1)) / 2,
                          recurrence: 'none',
                          endsOn: 'never',
                          effectiveFrom: dayIso,
                          effectiveUntil: dayIso,
                        }
                        setEditingBlock(newBlock)
                        setEditingBlockDate(null)
                        setBlockScope('all')
                        setIsCreatingBlock(true)
                        setShowBlockModal(true)
                      }}
                      style={{
                        height: 40 * timelineZoom,
                        borderBottom: '1px solid var(--color-bg-primary)',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(196, 106, 90, 0.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    />
                  ))}

                  {getAllBlockRangesForDay(unproductiveBlocks, dayDate).map((r, idx) => {
                    const topPercent = 40 + r.start * 40 * timelineZoom
                    const heightPercent = (r.end - r.start) * 40 * timelineZoom
                    const bgColor = r.block.title.toLowerCase().includes('dorm') ? 'rgba(75, 85, 102, 0.3)' : 'rgba(107, 100, 96, 0.25)'

                    return (
                      <div
                        key={`unproductive-${dayIso}-${r.block.id}-${idx}`}
                        onClick={() => {
                          setEditingBlock(r.block)
                          setEditingBlockDate(dayIso)
                          setBlockScope('this')
                          setShowBlockModal(true)
                        }}
                        style={{
                          position: 'absolute',
                          left: '0',
                          right: '0',
                          top: `${topPercent}px`,
                          height: `${Math.max(20, heightPercent)}px`,
                          background: bgColor,
                          borderLeft: `2px solid var(--color-text-muted)`,
                          zIndex: 1,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = bgColor.replace('0.3', '0.5').replace('0.25', '0.4')
                          e.currentTarget.style.borderLeft = '2px solid var(--color-accent-light)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = bgColor
                          e.currentTarget.style.borderLeft = '2px solid var(--color-text-muted)'
                        }}
                        title={`${r.block.title} - Clique para editar`}
                      >
                        {heightPercent > 20 && (
                          <div style={{
                            fontSize: 7,
                            color: 'var(--color-text-muted)',
                            padding: '1px 2px',
                            fontStyle: 'italic',
                            opacity: 0.6,
                          }}>
                            {r.block.title}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {dayIso === todayIso && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${40 + (currentTime.getHours() + currentTime.getMinutes() / 60) * 40 * timelineZoom}px`,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'var(--color-accent-light)',
                        zIndex: 100,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {quests.map((quest) => {
                    const sessions = allSessions.get(quest.id) || []
                    const daySessions = sessions.filter(s => {
                      const start = parseIsoAsUtc(s.started_at)
                      const startDate = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`
                      return startDate === dayIso
                    })
                    const parentQuest = quest.project_id ? projects.find(p => p.id === quest.project_id) : null
                    const displayTitle = parentQuest ? `${parentQuest.title} > ${quest.title}` : quest.title

                    return daySessions.map((session, idx) => {
                      const start = parseIsoAsUtc(session.started_at)
                      const end = session.ended_at ? parseIsoAsUtc(session.ended_at) : new Date()

                      const startHour = start.getHours() + start.getMinutes() / 60
                      const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60)

                      const topPercent = (startHour % 24) * 40 * timelineZoom
                      const heightPercent = Math.max(10, duration * 40 * timelineZoom)

                      return (
                        <div
                          key={`${quest.id}-${idx}`}
                          style={{
                            position: 'absolute',
                            left: '2px',
                            right: '2px',
                            top: `${40 + topPercent}px`,
                            height: `${heightPercent}px`,
                            background: getAreaColor(quest.area_slug, areas),
                            borderRadius: 2,
                            padding: '2px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            opacity: 0.85,
                            transition: 'opacity 0.15s, box-shadow 0.15s',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.opacity = '1'
                            e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.4)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.opacity = '0.85'
                            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)'
                          }}
                          title={displayTitle}
                        >
                          <div style={{ fontSize: 7, color: '#fff', textAlign: 'center', lineHeight: 1, padding: '1px' }}>
                            {displayTitle.substring(0, 20)}
                          </div>
                        </div>
                      )
                    })
                  })}

                  {dayRoutines.map((routine) => {
                    if (!routine.start_time || !routine.end_time) return null

                    const [startHours, startMinutes] = routine.start_time.split(':').map(Number)
                    const [endHours, endMinutes] = routine.end_time.split(':').map(Number)

                    const startTotal = startHours + startMinutes / 60
                    const endTotal = endHours + endMinutes / 60
                    const duration = endTotal - startTotal

                    const topPercent = startTotal * 40 * timelineZoom
                    const heightPercent = Math.max(10, duration * 40 * timelineZoom)

                    return (
                      <div
                        key={routine.id}
                        style={{
                          position: 'absolute',
                          left: '2px',
                          right: '2px',
                          top: `${40 + topPercent}px`,
                          height: `${heightPercent}px`,
                          background: 'var(--color-routine-block)',
                          borderRadius: 2,
                          border: '1px solid var(--color-routine-block-border)',
                          padding: '2px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          opacity: routine.done ? 0.5 : 0.8,
                          transition: 'opacity 0.15s, box-shadow 0.15s',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.opacity = routine.done ? '0.6' : '1'
                          e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.4)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.opacity = routine.done ? '0.5' : '0.8'
                          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)'
                        }}
                        title={routine.title}
                      >
                        <div style={{
                          fontSize: 7,
                          color: routine.done ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                          textAlign: 'center',
                          textDecoration: routine.done ? 'line-through' : 'none',
                          lineHeight: 1.1,
                          fontWeight: 500,
                        }}>
                          {routine.title.substring(0, 20)}
                        </div>
                        {heightPercent > 18 && (
                          <div style={{
                            fontSize: 6,
                            color: routine.done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                            marginTop: 1,
                          }}>
                            {routine.start_time}–{routine.end_time}
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Excluir rotina "${routine.title}"?`)) {
                              deleteRoutine(routine.id)
                                .then(() => setRoutines(rs => rs.filter(r => r.id !== routine.id)))
                                .catch(() => alert('Erro ao excluir rotina'))
                            }
                          }}
                          style={{
                            position: 'absolute',
                            top: '1px',
                            right: '1px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-error)',
                            cursor: 'pointer',
                            fontSize: '7px',
                            padding: '1px 2px',
                            opacity: 0.6,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                          title="Excluir rotina"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          </div>
        </div>
        )
      })()}

      {viewMode === 'mês' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1 }}
            >←</button>
            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500 }}>
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </div>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1 }}
            >→</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', padding: 8 }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {(() => {
              const year = currentDate.getFullYear()
              const month = currentDate.getMonth()
              // Semana começa na segunda: dom=6, seg=0, ter=1, ...
              const firstDay = (new Date(year, month, 1).getDay() + 6) % 7
              const daysInMonth = new Date(year, month + 1, 0).getDate()
              const cells = []

              for (let i = 0; i < firstDay; i++) {
                cells.push(
                  <div key={`empty-${i}`} style={{ background: 'var(--color-bg-primary)', minHeight: 80, borderRadius: 4 }} />
                )
              }

              for (let day = 1; day <= daysInMonth; day++) {
                const dayIso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const dayQuests = questsForDay(dayIso)
                const dayRoutines = routinesForDay(dayIso)
                const isToday = dayIso === todayIso

                cells.push(
                  <div key={day} style={{
                    padding: 8, background: 'var(--color-bg-secondary)', borderRadius: 4,
                    border: isToday ? `1px solid var(--color-accent-light)` : '1px solid var(--color-border)',
                    minHeight: 80, display: 'flex', flexDirection: 'column'
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 6 }}>
                      {day}
                    </div>
                    <div style={{ flex: 1, fontSize: 8, color: 'var(--color-text-tertiary)', overflow: 'hidden' }}>
                      {dayQuests.length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          {dayQuests.slice(0, 2).map(q => (
                            <div key={q.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
                              📋 {q.title}
                            </div>
                          ))}
                          {dayQuests.length > 2 && <div style={{ color: 'var(--color-border)' }}>+{dayQuests.length - 2}</div>}
                        </div>
                      )}
                      {dayRoutines.length > 0 && (
                        <div>
                          {dayRoutines.slice(0, 2).map(r => (
                            <div key={r.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
                              🔄 {r.title}
                            </div>
                          ))}
                          {dayRoutines.length > 2 && <div style={{ color: 'var(--color-border)' }}>+{dayRoutines.length - 2}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              return cells
            })()}
          </div>
        </div>
      )}

      {viewMode === 'ano' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear() - 1, 0, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1 }}
            >←</button>
            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500 }}>
              {currentDate.getFullYear()}
            </div>
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear() + 1, 0, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, padding: '4px 10px', lineHeight: 1 }}
            >→</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {MONTH_NAMES.map((monthName, monthIdx) => {
              const year = currentDate.getFullYear()
              // Semana começa na segunda: dom=6, seg=0, ter=1, ...
              const firstDay = (new Date(year, monthIdx, 1).getDay() + 6) % 7
              const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
              const monthQuests = quests.filter(q => {
                if (!q.deadline) return false
                const parts = q.deadline.split('-')
                return parseInt(parts[0]) === year && parseInt(parts[1]) === monthIdx + 1
              })
              const totalDeadlines = monthQuests.length

              return (
                <div key={monthIdx} style={{
                  padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 4,
                  border: currentDate.getMonth() === monthIdx ? '1px solid var(--color-accent-light)' : '1px solid var(--color-border)'
                }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {monthName}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 8 }}>
                    {DAY_NAMES.map(d => (
                      <div key={d} style={{ fontSize: 7, color: 'var(--color-border)', textAlign: 'center', fontWeight: 600, lineHeight: 1 }}>
                        {d[0]}
                      </div>
                    ))}

                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`empty-${i}`} style={{ fontSize: 8 }} />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
                      const day = dayIdx + 1
                      const dayIso = `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                      const hasDeadline = monthQuests.some(q => q.deadline === dayIso)

                      return (
                        <div
                          key={day}
                          style={{
                            fontSize: 8, textAlign: 'center', lineHeight: 1,
                            color: hasDeadline ? 'var(--color-accent-light)' : 'var(--color-text-tertiary)',
                            fontWeight: hasDeadline ? 600 : 400,
                            padding: 2
                          }}
                        >
                          {day}
                        </div>
                      )
                    })}
                  </div>

                  {totalDeadlines > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--color-accent-light)', borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
                      {totalDeadlines} deadline{totalDeadlines !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showBlockModal && editingBlock && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 24,
            width: '90%',
            maxWidth: 500,
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                {isCreatingBlock ? 'Novo Horário Improdutivo' : 'Editar Horário Improdutivo'}
              </h2>
              <button
                onClick={() => {
                  setShowBlockModal(false)
                  setEditingBlock(null)
                  setEditingBlockDate(null)
                  setIsCreatingBlock(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                  color: 'var(--color-text-secondary)',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Título
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={editingBlock.title}
                  onChange={(e) => setEditingBlock({ ...editingBlock, title: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    padding: '10px 12px',
                    color: 'var(--color-text-primary)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Início
                  </label>
                  <input
                    type="time"
                    value={`${Math.floor(editingBlock.start).toString().padStart(2, '0')}:${Math.round((editingBlock.start % 1) * 60).toString().padStart(2, '0')}`}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':').map(Number)
                      setEditingBlock({ ...editingBlock, start: hours + minutes / 60 })
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      padding: '10px 12px',
                      color: 'var(--color-text-primary)',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Fim
                  </label>
                  <input
                    type="time"
                    value={`${Math.floor(editingBlock.end).toString().padStart(2, '0')}:${Math.round((editingBlock.end % 1) * 60).toString().padStart(2, '0')}`}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':').map(Number)
                      setEditingBlock({ ...editingBlock, end: hours + minutes / 60 })
                    }}
                    title={editingBlock.end <= editingBlock.start ? 'Atravessa a meia-noite — vai até o dia seguinte' : undefined}
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4,
                      padding: '10px 12px',
                      color: 'var(--color-text-primary)',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
              </div>

              {editingBlock.end <= editingBlock.start && (
                <div style={{
                  fontSize: 10, color: 'var(--color-accent-light)', fontStyle: 'italic',
                  marginTop: -8,
                }}>
                  ↳ atravessa a meia-noite (segue até o dia seguinte)
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Recorrência
                </label>
                <select
                  value={editingBlock.recurrence}
                  onChange={(e) => {
                    const recurrence = e.target.value as any
                    const prev = editingBlock.recurrence
                    const updates: Partial<UnproductiveBlock> = { recurrence }

                    if (recurrence === 'none') {
                      // Evento único: janela = um dia só (âncora = data clicada
                      // ou hoje como fallback).
                      const now = new Date()
                      const anchor = editingBlockDate
                        ?? editingBlock.effectiveFrom
                        ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                      updates.effectiveFrom = anchor
                      updates.effectiveUntil = anchor
                      updates.daysOfWeek = undefined
                      updates.endsOn = 'never'
                      updates.endDate = undefined
                      updates.endCount = undefined
                    } else if (prev === 'none') {
                      // Sai de evento único pra recorrente: limpa a janela.
                      updates.effectiveFrom = undefined
                      updates.effectiveUntil = undefined
                    }

                    if (recurrence === 'custom') {
                      updates.daysOfWeek = editingBlock.daysOfWeek || [1, 2, 3, 4, 5]
                    } else if (recurrence !== 'weekly' && recurrence !== 'custom') {
                      updates.daysOfWeek = undefined
                    }

                    setEditingBlock({ ...editingBlock, ...updates })
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    padding: '10px 12px',
                    color: 'var(--color-text-primary)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="none">Não se repete</option>
                  <option value="daily">Todo dia</option>
                  <option value="weekdays">Segunda-Sexta</option>
                  <option value="weekly">Semanal</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              {(editingBlock.recurrence === 'weekly' || editingBlock.recurrence === 'custom') && (
                <div>
                  <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                    Dias da Semana
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day, idx) => (
                      <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(editingBlock.daysOfWeek || []).includes(idx)}
                          onChange={(e) => {
                            const days = editingBlock.daysOfWeek || []
                            if (e.target.checked) {
                              setEditingBlock({ ...editingBlock, daysOfWeek: [...days, idx].sort((a, b) => a - b) })
                            } else {
                              setEditingBlock({ ...editingBlock, daysOfWeek: days.filter(d => d !== idx) })
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {editingBlock.recurrence !== 'none' && (
              <div>
                <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Termina em
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="endsOn"
                      value="never"
                      checked={editingBlock.endsOn === 'never'}
                      onChange={() => setEditingBlock({ ...editingBlock, endsOn: 'never' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>Nunca</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="endsOn"
                      value="date"
                      checked={editingBlock.endsOn === 'date'}
                      onChange={() => setEditingBlock({ ...editingBlock, endsOn: 'date' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>Em uma data</span>
                  </label>
                  {editingBlock.endsOn === 'date' && (
                    <input
                      type="date"
                      autoComplete="off"
                      value={editingBlock.endDate || ''}
                      onChange={(e) => setEditingBlock({ ...editingBlock, endDate: e.target.value })}
                      style={{
                        marginLeft: 24,
                        background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        padding: '8px 12px',
                        color: 'var(--color-text-primary)',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="endsOn"
                      value="count"
                      checked={editingBlock.endsOn === 'count'}
                      onChange={() => setEditingBlock({ ...editingBlock, endsOn: 'count' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>Após ocorrências</span>
                  </label>
                  {editingBlock.endsOn === 'count' && (
                    <input
                      type="number"
                      autoComplete="off"
                      min="1"
                      value={editingBlock.endCount || 1}
                      onChange={(e) => setEditingBlock({ ...editingBlock, endCount: parseInt(e.target.value) })}
                      style={{
                        marginLeft: 24,
                        width: 80,
                        background: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        padding: '8px 12px',
                        color: 'var(--color-text-primary)',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                {!isCreatingBlock && (
                  <button
                    onClick={() => {
                      // Bloco recorrente + temos data clicada: pergunta escopo
                      // (apenas este / este e os seguintes / todos).
                      if (editingBlock.recurrence !== 'none' && editingBlockDate) {
                        setBlockScope('this')
                        setScopeAction('delete')
                        setShowScopePopup(true)
                        return
                      }
                      // Evento único: confirma e apaga direto.
                      if (confirm(`Deletar "${editingBlock.title}"?`)) {
                        setUnproductiveBlocks(unproductiveBlocks.filter(b => b.id !== editingBlock.id))
                        setShowBlockModal(false)
                        setEditingBlock(null)
                        setEditingBlockDate(null)
                        setIsCreatingBlock(false)
                      }
                    }}
                    style={{
                      flex: 1,
                      background: 'var(--color-error)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '10px 16px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Deletar
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowBlockModal(false)
                    setEditingBlock(null)
                    setEditingBlockDate(null)
                    setIsCreatingBlock(false)
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-text-primary)'
                    e.currentTarget.style.background = 'var(--color-bg-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.background = 'var(--color-bg-tertiary)'
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (isCreatingBlock || editingBlock.recurrence === 'none') {
                      // Bloco novo OU evento único — salva direto, sem escopo.
                      if (isCreatingBlock) {
                        setUnproductiveBlocks([...unproductiveBlocks, editingBlock!])
                      } else {
                        setUnproductiveBlocks(unproductiveBlocks.map(b => b.id === editingBlock.id ? editingBlock : b))
                      }
                      setShowBlockModal(false)
                      setEditingBlock(null)
                      setEditingBlockDate(null)
                      setIsCreatingBlock(false)
                    } else {
                      // Bloco recorrente existente — pergunta escopo via popup.
                      setBlockScope('this')
                      setScopeAction('save')
                      setShowScopePopup(true)
                    }
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--color-accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  {isCreatingBlock ? 'Criar' : 'Concluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScopePopup && editingBlock && editingBlockDate && (
        <div
          onClick={() => setShowScopePopup(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'scope-fade-in 0.15s ease-out',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            style={{
              width: 'min(420px, 92vw)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
              padding: '20px 24px',
              display: 'flex', flexDirection: 'column', gap: 14,
              color: 'var(--color-text-primary)',
              animation: 'scope-pop-in 0.15s ease-out',
            }}
          >
            <div>
              <div style={{
                fontSize: 10, color: 'var(--color-text-tertiary)',
                letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
                marginBottom: 4,
              }}>
                {scopeAction === 'delete' ? 'Excluir' : 'Aplicar a'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Este bloco se repete. Escolha o escopo {scopeAction === 'delete' ? 'da exclusão' : 'da alteração'}.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(scopeAction === 'delete'
                ? [
                    { value: 'this' as const,      label: 'Apenas este evento',  desc: `só remove ${editingBlockDate.split('-').reverse().join('/')}` },
                    { value: 'following' as const, label: 'Este e os seguintes', desc: `remove a partir de ${editingBlockDate.split('-').reverse().join('/')}` },
                    { value: 'all' as const,       label: 'Todos os eventos',    desc: 'exclui a série inteira' },
                  ]
                : [
                    { value: 'this' as const,      label: 'Apenas este evento',  desc: `só altera ${editingBlockDate.split('-').reverse().join('/')}` },
                    { value: 'following' as const, label: 'Este e os seguintes', desc: `a partir de ${editingBlockDate.split('-').reverse().join('/')}` },
                    { value: 'all' as const,       label: 'Todos os eventos',    desc: 'a série inteira' },
                  ]
              ).map(opt => {
                const active = blockScope === opt.value
                return (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px',
                      border: `1px solid ${active ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                      borderRadius: 3, cursor: 'pointer',
                      background: active ? 'rgba(139, 46, 46, 0.08)' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="block-scope-popup"
                      checked={active}
                      onChange={() => setBlockScope(opt.value)}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-accent-primary)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      }}>
                        {opt.label}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}>
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--color-divider)',
            }}>
              <button
                onClick={() => setShowScopePopup(false)}
                style={{
                  background: 'none', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-tertiary)', cursor: 'pointer',
                  padding: '8px 16px', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  borderRadius: 3, transition: 'all 0.15s',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const scope = blockScope
                  const dateIso = editingBlockDate
                  const eb = editingBlock

                  if (scopeAction === 'delete') {
                    // Excluir conforme o escopo escolhido.
                    if (scope === 'this') {
                      // Marca esse dia como skipped no overrides do bloco.
                      const original = unproductiveBlocks.find(b => b.id === eb.id)
                      if (original) {
                        const overrides = (original.overrides || []).filter(o => o.date !== dateIso)
                        overrides.push({ date: dateIso, skipped: true })
                        setUnproductiveBlocks(unproductiveBlocks.map(b =>
                          b.id === eb.id ? { ...original, overrides } : b
                        ))
                      }
                    } else if (scope === 'following') {
                      // Encerra a série no dia anterior.
                      const d = new Date(dateIso + 'T00:00:00')
                      d.setDate(d.getDate() - 1)
                      const prevDayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      setUnproductiveBlocks(unproductiveBlocks.map(b =>
                        b.id === eb.id
                          ? {
                              ...b,
                              effectiveUntil: prevDayIso,
                              overrides: (b.overrides || []).filter(o => o.date < dateIso),
                            }
                          : b
                      ))
                    } else {
                      // Deleta a série inteira.
                      setUnproductiveBlocks(unproductiveBlocks.filter(b => b.id !== eb.id))
                    }
                  } else {
                    // Salvar (commit do edit).
                    if (scope === 'this') {
                      const original = unproductiveBlocks.find(b => b.id === eb.id)
                      if (original) {
                        const overrides = (original.overrides || []).filter(o => o.date !== dateIso)
                        overrides.push({ date: dateIso, start: eb.start, end: eb.end })
                        setUnproductiveBlocks(unproductiveBlocks.map(b =>
                          b.id === eb.id ? { ...original, overrides } : b
                        ))
                      }
                    } else if (scope === 'following') {
                      const d = new Date(dateIso + 'T00:00:00')
                      d.setDate(d.getDate() - 1)
                      const prevDayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      const newBlock: UnproductiveBlock = {
                        ...eb,
                        id: Date.now().toString(),
                        effectiveFrom: dateIso,
                        effectiveUntil: undefined,
                        overrides: (eb.overrides || []).filter(o => o.date >= dateIso),
                      }
                      setUnproductiveBlocks([
                        ...unproductiveBlocks.map(b =>
                          b.id === eb.id
                            ? {
                                ...b,
                                effectiveUntil: prevDayIso,
                                overrides: (b.overrides || []).filter(o => o.date < dateIso),
                              }
                            : b
                        ),
                        newBlock,
                      ])
                    } else {
                      setUnproductiveBlocks(unproductiveBlocks.map(b => b.id === eb.id ? eb : b))
                    }
                  }

                  setShowScopePopup(false)
                  setShowBlockModal(false)
                  setEditingBlock(null)
                  setEditingBlockDate(null)
                  setIsCreatingBlock(false)
                  setScopeAction('save')
                }}
                style={{
                  background: scopeAction === 'delete' ? 'var(--color-error)' : 'var(--color-accent-primary)',
                  border: 'none',
                  color: '#fff', cursor: 'pointer',
                  padding: '8px 16px', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  borderRadius: 3, transition: 'background 0.15s',
                }}
              >
                {scopeAction === 'delete' ? 'Excluir' : 'Aplicar'}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes scope-fade-in {
              from { opacity: 0; } to { opacity: 1; }
            }
            @keyframes scope-pop-in {
              from { opacity: 0; transform: scale(0.96); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

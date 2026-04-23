import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sunrise, Sun, Moon, X, ArrowRight, Calendar as CalendarIcon, Trash2 } from 'lucide-react'
import type { ActiveSession, Area, Deliverable, Quest, Routine, Task } from '../types'
import { fetchAllRoutines, fetchTasks, fetchQuests, fetchDeliverables, fetchRoutinesForDate, updateTask, deleteTask, reportApiError } from '../api'
import { isoToLocalYmd } from '../utils/datetime'
import type { DateRange } from '../utils/dateRange'
import { computeRange } from '../utils/dateRange'
import type { DayPeriods } from '../utils/dayPeriods'
import { loadDayPeriods, periodRangesMinFrom, minutesToHHMM } from '../utils/dayPeriods'
import type { BlockRange } from '../utils/blocks'
import { getAllBlockRangesForDay } from '../utils/blocks'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { DayPeriodsEditModal } from '../components/DayPeriodsEditModal'
import { PlannedItemRow } from '../components/PlannedItemRow'

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtHM(min: number): string {
  const abs = Math.max(0, Math.round(Math.abs(min)))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function itemDurationMin(item: any): number {
  if (item.isTask) return item.duration_minutes ?? 0
  // quests e rotinas usam estimated_minutes.
  return item.estimated_minutes ?? 0
}

/**
 * `/dia` — planejamento diário. Uma linha de veredito no topo ("planejado
 * X de Y disponíveis"), drawer de planejamento com drag-and-drop (filtros +
 * split disponíveis × períodos), e três blocos minimalistas pra manhã/tarde/
 * noite. Persiste plano em `hq-day-plan` (localStorage).
 */
export function DiaView({ quests, areas, activeSession, onSessionUpdate, onSelectQuest }: {
  quests: Quest[]
  areas: Area[]
  activeSession: ActiveSession | null
  onSessionUpdate: () => void
  onSelectQuest: (id: string | null) => void
}) {
  const navigate = useNavigate()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [showPlanner, setShowPlanner] = useState(false)
  const [plannerRange, setPlannerRange] = useState<DateRange>(() => computeRange('7d'))
  const [plannerTypes, setPlannerTypes] = useState<Set<'quest' | 'task' | 'routine'>>(
    new Set(['quest', 'task', 'routine'])
  )
  const [plannerIncludeUndated, setPlannerIncludeUndated] = useState(true)
  // Filtro de prioridade: `null` = sem filtro; Set de prioridades = só essas.
  // Default: todas habilitadas.
  const [plannerPriorities, setPlannerPriorities] = useState<Set<string>>(
    new Set(['critical', 'high', 'medium', 'low'])
  )
  const [dayPeriods, setDayPeriods] = useState<DayPeriods>(() => loadDayPeriods())
  const [editingPeriods, setEditingPeriods] = useState(false)
  // Storage por dia: `hq-day-plan-YYYY-MM-DD`. Dia novo começa com slots
  // vazios — o que ficou pendente cai no banner de revisão ao invés de virar
  // lixo arrastado.
  const todayIsoForStorage = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const dayPlanKey = `hq-day-plan-${todayIsoForStorage}`
  const [dayPlan, setDayPlan] = useState<{ morning: string[]; afternoon: string[]; evening: string[] }>(() => {
    // Migra o antigo `hq-day-plan` pro slot de hoje na primeira carga.
    const todayScoped = localStorage.getItem(dayPlanKey)
    if (todayScoped) return JSON.parse(todayScoped)
    const legacy = localStorage.getItem('hq-day-plan')
    if (legacy) {
      try { localStorage.setItem(dayPlanKey, legacy) } catch {}
      localStorage.removeItem('hq-day-plan')
      return JSON.parse(legacy)
    }
    return { morning: [], afternoon: [], evening: [] }
  })
  const [draggedItem, setDraggedItem] = useState<any>(null)
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [doneRoutineIds, setDoneRoutineIds] = useState<Set<string>>(new Set())
  const [delivsByProject, setDelivsByProject] = useState<Record<string, Deliverable[]>>({})

  const todayIsoForTasks = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  function refreshAllTasks() { fetchTasks().then(setAllTasks).catch(err => reportApiError('DiaPage', err)) }
  function refreshDoneRoutines() {
    fetchRoutinesForDate(todayIsoForTasks)
      .then(list => setDoneRoutineIds(new Set(list.filter(r => r.done).map(r => r.id))))
      .catch(err => reportApiError('refreshDoneRoutines', err))
  }

  useEffect(() => {
    fetchAllRoutines().then(setRoutines).catch(err => reportApiError('DiaPage', err))
  }, [])
  // Recarrega tasks quando a sessão ativa muda — finalização via banner
  // marca a task como done no backend, mas o estado local não atualiza sem
  // refetch.
  useEffect(() => { refreshAllTasks() }, [activeSession?.type, activeSession?.id, activeSession?.started_at, activeSession?.ended_at])
  useEffect(() => { refreshDoneRoutines() }, [todayIsoForTasks, activeSession?.type, activeSession?.id, activeSession?.started_at, activeSession?.ended_at])

  useEffect(() => {
    const projectIds = Array.from(new Set(quests.filter(q => q.parent_id).map(q => q.parent_id!)))
    if (projectIds.length === 0) { setDelivsByProject({}); return }
    let cancelled = false
    Promise.all(projectIds.map(pid =>
      fetchDeliverables(pid)
        .then(ds => ({ pid, ds }))
        .catch(() => ({ pid, ds: [] as Deliverable[] }))
    )).then(results => {
      if (cancelled) return
      const map: Record<string, Deliverable[]> = {}
      for (const r of results) map[r.pid] = r.ds
      setDelivsByProject(map)
    })
    return () => { cancelled = true }
  }, [quests.map(q => q.id + ':' + (q.deliverable_id ?? '') + ':' + (q.parent_id ?? '')).join(',')])

  useEffect(() => {
    localStorage.setItem(dayPlanKey, JSON.stringify(dayPlan))
  }, [dayPlan, dayPlanKey])

  // Limpa plans de dias passados pra não acumular lixo no localStorage.
  // (Mantém os últimos 7 dias por segurança — não precisa ser agressivo.)
  useEffect(() => {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith('hq-day-plan-')) continue
        const keyDate = key.slice('hq-day-plan-'.length)
        if (keyDate < cutoffIso) localStorage.removeItem(key)
      }
    } catch {}
  }, [])

  function routineAppliesInRange(r: Routine, from: Date | null, to: Date | null): boolean {
    if (!from || !to) return true
    const cur = new Date(from); cur.setHours(0, 0, 0, 0)
    const end = new Date(to); end.setHours(0, 0, 0, 0)
    while (cur <= end) {
      const jsDow = cur.getDay()
      const pyDow = (jsDow + 6) % 7
      if (r.recurrence === 'daily') return true
      if (r.recurrence === 'weekdays' && jsDow >= 1 && jsDow <= 5) return true
      if (r.recurrence === 'weekly') {
        if (r.days_of_week) {
          const days = r.days_of_week.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
          if (days.includes(pyDow)) return true
        } else if (r.day_of_week !== null && r.day_of_week !== undefined) {
          if (r.day_of_week === pyDow) return true
        }
      }
      if (r.recurrence === 'monthly' && r.day_of_month === cur.getDate()) return true
      cur.setDate(cur.getDate() + 1)
    }
    return false
  }

  const getFilteredItems = () => {
    const fromIso = plannerRange.from ? isoToLocalYmd(plannerRange.from) : null
    const toIso = plannerRange.to ? isoToLocalYmd(plannerRange.to) : null
    const isUnbounded = !fromIso || !toIso
    const withinRange = (iso: string | null | undefined): boolean => {
      if (!iso) return plannerIncludeUndated
      if (isUnbounded) return true
      return iso >= fromIso! && iso <= toIso!
    }

    const priorityOK = (p: string | undefined | null) => plannerPriorities.has(p || 'critical')

    const items: any[] = []
    if (plannerTypes.has('quest')) {
      // Só quests filhas (subtasks) aparecem no planejador. Projetos são
      // containers — você planeja o trabalho granular (as quests dentro
      // deles), não o projeto em si. Herdam a deadline do projeto se a
      // subtask não tem uma própria.
      items.push(...quests.filter(q =>
        q.parent_id
        && q.status !== 'done'
        && q.status !== 'cancelled'
        && withinRange(q.deadline)
        && priorityOK(q.priority)
      ))
    }
    if (plannerTypes.has('task')) {
      items.push(...allTasks.filter(t => !t.done && withinRange(t.scheduled_date) && priorityOK((t as any).priority)).map(t => ({ ...t, isTask: true })))
    }
    if (plannerTypes.has('routine')) {
      items.push(...routines.filter(r => routineAppliesInRange(r, plannerRange.from, plannerRange.to) && priorityOK((r as any).priority))
        .map(r => ({ ...r, isRoutine: true, done: doneRoutineIds.has(r.id) })))
    }

    return items.sort((a, b) => {
      if (a.isRoutine && !b.isRoutine) return 1
      if (!a.isRoutine && b.isRoutine) return -1
      const ad = (a as any).deadline ?? (a as any).scheduled_date ?? ''
      const bd = (b as any).deadline ?? (b as any).scheduled_date ?? ''
      return String(ad).localeCompare(String(bd))
    })
  }

  // Tasks atrasadas: agendadas num dia passado e ainda não feitas. Rotinas
  // ficam fora (cada dia é instância nova). Quests ficam fora (não têm data).
  const overdueTasks = allTasks.filter(t =>
    !t.done && t.scheduled_date && t.scheduled_date < todayIsoForTasks
  ).sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))

  function handleTaskToToday(t: Task) {
    updateTask(t.id, { scheduled_date: todayIsoForTasks })
      .then(() => refreshAllTasks())
      .catch(err => reportApiError('DiaPage', err))
  }
  function handleTaskReschedule(t: Task, newDate: string) {
    if (!newDate) return
    updateTask(t.id, { scheduled_date: newDate })
      .then(() => refreshAllTasks())
      .catch(err => reportApiError('DiaPage', err))
  }
  function handleTaskDiscard(t: Task) {
    if (!window.confirm(`Descartar "${t.title}"? A tarefa será excluída.`)) return
    deleteTask(t.id)
      .then(() => refreshAllTasks())
      .catch(err => reportApiError('DiaPage', err))
  }

  const filteredItems = getFilteredItems()
  const plannedItemIds = [...dayPlan.morning, ...dayPlan.afternoon, ...dayPlan.evening]
  // Pool completo (ignora filtros do planner) pra contar tudo que está no dia.
  const fullPool: any[] = [
    ...quests.filter(q => q.status !== 'done'),
    ...allTasks.filter(t => !t.done).map(t => ({ ...t, isTask: true })),
    ...routines.map(r => ({ ...r, isRoutine: true, done: doneRoutineIds.has(r.id) })),
  ]
  const plannedItems = fullPool.filter(item => plannedItemIds.includes(item.id))
  const questCount = plannedItems.filter(i => !i.isTask && !i.isRoutine).length
  const taskCount = plannedItems.filter(i => i.isTask).length
  const routineCount = plannedItems.filter(i => i.isRoutine).length

  // ─── Live counter: recalcula a cada minuto com base no relógio atual. ─────
  // Capacidade restante = do "agora" até o fim do último período (subtraindo
  // blocos improdutivos que caem depois do agora). Pendente = itens ainda não
  // feitos. Folga agora = restante − pendente.
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const nowDate = new Date(nowTick)
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes()

  const productiveMinRemaining = (() => {
    let blockRanges: BlockRange[] = []
    try {
      const saved = localStorage.getItem('hq-unproductive-blocks')
      if (saved) blockRanges = getAllBlockRangesForDay(JSON.parse(saved), nowDate)
    } catch {}
    const periodRangesMin = periodRangesMinFrom(dayPeriods)
    let total = 0
    for (const period of ['morning', 'afternoon', 'evening'] as const) {
      const [startMin, endMin] = periodRangesMin[period]
      const effStart = Math.max(startMin, nowMin)
      if (effStart >= endMin) continue  // período já passou
      const windowMin = endMin - effStart
      const unproductiveInRemaining = blockRanges.reduce((sum, r) => {
        const blockStartMin = r.start * 60
        const blockEndMin = r.end * 60
        const overlapStart = Math.max(blockStartMin, effStart)
        const overlapEnd = Math.min(blockEndMin, endMin)
        return sum + Math.max(0, overlapEnd - overlapStart)
      }, 0)
      total += Math.max(0, windowMin - unproductiveInRemaining)
    }
    return total
  })()

  // Pendente = itens no plano que ainda não foram marcados como feitos.
  const pendingMin = plannedItems
    .filter(it => !(it.status === 'done' || it.done === true))
    .reduce((s, it) => s + itemDurationMin(it), 0)
  const liveSlackMin = productiveMinRemaining - pendingMin
  const liveDeficit = liveSlackMin < 0
  const liveColor = liveDeficit
    ? 'var(--color-accent-primary)'
    : productiveMinRemaining > 0 && pendingMin / Math.max(1, productiveMinRemaining) > 0.75
      ? 'var(--color-warning)'
      : 'var(--color-success)'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto', color: 'var(--color-text-primary)' }}>

      {/* ─── Header ─── */}
      <header style={{
        display: 'flex', alignItems: 'flex-end', gap: 14,
        paddingBottom: 20, borderBottom: '1px solid var(--color-divider)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--color-text-tertiary)',
            letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
            marginBottom: 4,
          }}>
            Dia
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
            color: 'var(--color-text-primary)', lineHeight: 1.2,
            textTransform: 'capitalize',
          }}>
            {todayLabel}
          </div>
        </div>

        <button
          onClick={() => setEditingPeriods(true)}
          title={`Ajustar períodos do dia · Manhã ${minutesToHHMM(dayPeriods.morningStart)} · Tarde ${minutesToHHMM(dayPeriods.afternoonStart)} · Noite ${minutesToHHMM(dayPeriods.eveningStart)}`}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: 9,
            letterSpacing: '0.05em',
            padding: '4px 6px', transition: 'color 0.15s',
            opacity: 0.7,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
        >
          ajustar períodos
        </button>

        <button
          onClick={() => setShowPlanner(true)}
          style={{
            background: 'var(--color-accent-primary)', border: 'none', cursor: 'pointer',
            color: 'var(--color-bg-primary)', fontSize: 11, fontWeight: 700,
            padding: '8px 16px', borderRadius: 3,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-accent-primary)')}
        >
          Planejar dia
        </button>
      </header>

      {overdueTasks.length > 0 && (
        <OverdueTasksBanner
          tasks={overdueTasks}
          onToToday={handleTaskToToday}
          onReschedule={handleTaskReschedule}
          onDiscard={handleTaskDiscard}
        />
      )}

      {/* ─── Veredito em tempo real ─────────────────────────────────────────
          Tudo ao vivo: capacidade restante (do relógio até o fim dos períodos),
          pendente (itens planejados não-feitos) e folga/déficit atual.
          Atualiza a cada minuto. O "planejamento original" é passado — só
          interessa o quanto você ainda tem pra fazer agora. */}
      <section style={{ marginTop: 48, marginBottom: 56 }}>
        <div style={{
          fontSize: 10, color: 'var(--color-text-tertiary)',
          letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
          marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>Agora</span>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 500, letterSpacing: '0.05em' }}>
            {String(nowDate.getHours()).padStart(2, '0')}:{String(nowDate.getMinutes()).padStart(2, '0')}
          </span>
        </div>

        <div style={{
          fontSize: 36, fontWeight: 700, lineHeight: 1.1,
          color: liveColor,
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: '-0.02em',
          display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        }}>
          <span>{fmtHM(Math.abs(liveSlackMin))}</span>
          <span style={{
            fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.15em',
          }}>
            {liveDeficit ? 'de déficit' : 'de folga'}
          </span>
        </div>

        {/* Barra: pendente / livre (ao vivo). */}
        {(() => {
          // Real = sem teto (pode passar de 100% em caso de déficit).
          // Visível = capado em 100% só pra barra não vazar graficamente.
          const livePctRaw = productiveMinRemaining > 0
            ? (pendingMin / productiveMinRemaining) * 100
            : (pendingMin > 0 ? 999 : 0)
          const livePct = Math.min(100, livePctRaw)
          const overflow = productiveMinRemaining > 0 && pendingMin > productiveMinRemaining
          return (
            <div style={{ marginTop: 18, maxWidth: 520 }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: 'var(--color-bg-tertiary)',
                overflow: 'hidden', position: 'relative',
              }}>
                <div style={{
                  height: '100%',
                  width: `${livePct}%`,
                  background: liveColor,
                  transition: 'width 0.3s ease-out',
                }} />
                {overflow && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0,
                    width: 3, background: 'var(--color-accent-primary)',
                  }} />
                )}
              </div>
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                fontSize: 10, color: 'var(--color-text-tertiary)',
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                <span>
                  <span style={{ color: 'var(--color-text-muted)', marginRight: 5 }}>pendente</span>
                  {fmtHM(pendingMin)}
                </span>
                <span>·</span>
                <span>
                  <span style={{ color: 'var(--color-text-muted)', marginRight: 5 }}>livre até fim</span>
                  {fmtHM(productiveMinRemaining)}
                </span>
                <span>·</span>
                <span style={{ color: liveColor, fontWeight: 600 }}>{Math.round(livePctRaw)}%</span>
              </div>
            </div>
          )
        })()}

        {/* Breakdown por tipo — mantém pro contexto rápido do que tá no plano. */}
        <div style={{
          marginTop: 14, fontSize: 10,
          color: 'var(--color-text-muted)',
          fontFamily: "'IBM Plex Mono', monospace",
          display: 'flex', gap: 12,
          letterSpacing: '0.05em',
        }}>
          <span>{questCount} {questCount === 1 ? 'quest' : 'quests'}</span>
          <span>·</span>
          <span>{taskCount} {taskCount === 1 ? 'tarefa' : 'tarefas'}</span>
          <span>·</span>
          <span>{routineCount} {routineCount === 1 ? 'rotina' : 'rotinas'}</span>
        </div>
      </section>

      {/* ─── Períodos ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {(['morning', 'afternoon', 'evening'] as const).map(period => (
          <PeriodSection
            key={period}
            period={period}
            dayPeriods={dayPeriods}
            dayPlan={dayPlan}
            quests={quests}
            allTasks={allTasks}
            routines={routines}
            doneRoutineIds={doneRoutineIds}
            areas={areas}
            activeSession={activeSession}
            delivsByProject={delivsByProject}
            todayIsoForTasks={todayIsoForTasks}
            onSessionUpdate={() => {
              onSessionUpdate()
              refreshAllTasks()
              fetchAllRoutines().then(setRoutines).catch(err => reportApiError('DiaPage', err))
              refreshDoneRoutines()
              fetchQuests().then(() => {}).catch(err => reportApiError('DiaPage', err))
            }}
            onRemoveFromPlan={(itemId) => {
              setDayPlan(prev => ({
                ...prev,
                [period]: prev[period].filter(id => id !== itemId),
              }))
            }}
            onOpenPlanner={() => setShowPlanner(true)}
            onOpenQuest={(q) => {
              // Clique numa quest (subtask) → abre o PROJETO PAI em
              // /areas/{slug}. A AreaDetailView só mostra detalhe pra quests
              // top-level, então passar o id da subtask não abre nada.
              if (!q.parent_id) return
              onSelectQuest(q.parent_id)
              navigate(`/areas/${q.area_slug}`)
            }}
          />
        ))}
      </div>

      {editingPeriods && (
        <DayPeriodsEditModal
          value={dayPeriods}
          onClose={() => setEditingPeriods(false)}
          onSave={setDayPeriods}
        />
      )}

      {showPlanner && (
        <PlannerDrawer
          filteredItems={filteredItems}
          dayPlan={dayPlan}
          setDayPlan={setDayPlan}
          plannerRange={plannerRange}
          setPlannerRange={setPlannerRange}
          plannerTypes={plannerTypes}
          setPlannerTypes={setPlannerTypes}
          plannerIncludeUndated={plannerIncludeUndated}
          setPlannerIncludeUndated={setPlannerIncludeUndated}
          plannerPriorities={plannerPriorities}
          setPlannerPriorities={setPlannerPriorities}
          draggedItem={draggedItem}
          setDraggedItem={setDraggedItem}
          areas={areas}
          quests={quests}
          routines={routines}
          allTasks={allTasks}
          delivsByProject={delivsByProject}
          dayPeriods={dayPeriods}
          doneRoutineIds={doneRoutineIds}
          onClose={() => setShowPlanner(false)}
        />
      )}
    </div>
  )
}

// ─── PeriodSection ─────────────────────────────────────────────────────────

function PeriodSection({
  period, dayPeriods, dayPlan, quests, allTasks, routines, doneRoutineIds,
  areas, activeSession, delivsByProject, todayIsoForTasks,
  onSessionUpdate, onRemoveFromPlan, onOpenPlanner, onOpenQuest,
}: {
  period: 'morning' | 'afternoon' | 'evening'
  dayPeriods: DayPeriods
  dayPlan: { morning: string[]; afternoon: string[]; evening: string[] }
  quests: Quest[]
  allTasks: Task[]
  routines: Routine[]
  doneRoutineIds: Set<string>
  areas: Area[]
  activeSession: ActiveSession | null
  delivsByProject: Record<string, Deliverable[]>
  todayIsoForTasks: string
  onSessionUpdate: () => void
  onRemoveFromPlan: (itemId: string) => void
  onOpenPlanner: () => void
  onOpenQuest: (q: Quest) => void
}) {
  const META = {
    morning: { Icon: Sunrise, label: 'Manhã' },
    afternoon: { Icon: Sun, label: 'Tarde' },
    evening: { Icon: Moon, label: 'Noite' },
  }[period]

  const periodRangesMin = periodRangesMinFrom(dayPeriods)
  const [startMin, endMin] = periodRangesMin[period]
  const totalPeriodMin = endMin - startMin

  let ranges: BlockRange[] = []
  try {
    const saved = localStorage.getItem('hq-unproductive-blocks')
    if (saved) ranges = getAllBlockRangesForDay(JSON.parse(saved), new Date())
  } catch {}
  const unproductiveMin = ranges.reduce((sum, r) => {
    const blockStartMin = r.start * 60
    const blockEndMin = r.end * 60
    const overlapStart = Math.max(blockStartMin, startMin)
    const overlapEnd = Math.min(blockEndMin, endMin)
    return sum + Math.max(0, overlapEnd - overlapStart)
  }, 0)
  const availableMin = Math.max(0, totalPeriodMin - unproductiveMin)

  const allItems = [
    ...quests,
    ...routines.map(r => ({ ...r, isRoutine: true, done: doneRoutineIds.has(r.id) })),
    ...allTasks.map(t => ({ ...t, isTask: true })),
  ]
  // Renderiza NA ORDEM do dayPlan (e não na ordem do pool) pra respeitar a
  // reordenação que o user faz via drag-and-drop.
  const periodItems = dayPlan[period]
    .map(id => allItems.find(it => it.id === id))
    .filter((it): it is any => !!it)
  const usedMin = periodItems.reduce((s, item) => s + itemDurationMin(item), 0)
  const remainingMin = availableMin - usedMin
  const isExceeded = remainingMin < 0

  const metricColor = isExceeded ? 'var(--color-accent-primary)' : 'var(--color-success)'

  return (
    <section>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 14,
      }}>
        <META.Icon size={12} strokeWidth={1.8} style={{ color: 'var(--color-text-tertiary)' }} />
        <div style={{
          fontSize: 10, color: 'var(--color-text-tertiary)',
          letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          {META.label}
        </div>
        <div style={{
          fontSize: 10, color: 'var(--color-text-muted)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {minutesToHHMM(startMin)}–{minutesToHHMM(endMin)}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          fontSize: 10, color: metricColor,
          fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
        }}>
          {isExceeded
            ? `−${fmtHM(Math.abs(remainingMin))}`
            : `+${fmtHM(remainingMin)} livre`}
        </div>
      </div>

      {periodItems.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {periodItems.map(item => {
            let parentTitle: string | null = null
            let deliverableTitle: string | null = null
            if (!(item as any).isTask && !(item as any).isRoutine) {
              const q = item as Quest
              if (q.parent_id) {
                const parent = quests.find(p => p.id === q.parent_id)
                if (parent) parentTitle = parent.title
                const deliv = delivsByProject[q.parent_id]?.find(d => d.id === q.deliverable_id)
                if (deliv) deliverableTitle = deliv.title
              }
            }
            return (
              <PlannedItemRow
                key={item.id}
                item={item}
                areas={areas}
                activeSession={activeSession}
                onSessionUpdate={onSessionUpdate}
                onRemoveFromPlan={() => onRemoveFromPlan(item.id)}
                target={todayIsoForTasks}
                parentTitle={parentTitle}
                deliverableTitle={deliverableTitle}
                onOpen={!(item as any).isTask && !(item as any).isRoutine
                  ? () => onOpenQuest(item as Quest)
                  : undefined}
              />
            )
          })}
        </div>
      ) : (
        <button
          onClick={onOpenPlanner}
          style={{
            width: '100%', padding: '18px 16px', background: 'none',
            border: '1px dashed var(--color-border)', borderRadius: 3,
            color: 'var(--color-text-muted)', fontSize: 11,
            fontStyle: 'italic', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--color-accent-light)'
            e.currentTarget.style.color = 'var(--color-accent-light)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.color = 'var(--color-text-muted)'
          }}
        >
          vazio — planejar
        </button>
      )}
    </section>
  )
}

// ─── PlannerDrawer ─────────────────────────────────────────────────────────

function PlannerDrawer({
  filteredItems, dayPlan, setDayPlan,
  plannerRange, setPlannerRange,
  plannerTypes, setPlannerTypes,
  plannerIncludeUndated, setPlannerIncludeUndated,
  plannerPriorities, setPlannerPriorities,
  draggedItem, setDraggedItem,
  areas, quests, routines, allTasks, doneRoutineIds,
  delivsByProject,
  dayPeriods,
  onClose,
}: {
  filteredItems: any[]
  dayPlan: { morning: string[]; afternoon: string[]; evening: string[] }
  setDayPlan: (fn: (prev: any) => any) => void
  plannerRange: DateRange
  setPlannerRange: (r: DateRange) => void
  plannerTypes: Set<'quest' | 'task' | 'routine'>
  setPlannerTypes: (fn: (prev: Set<'quest' | 'task' | 'routine'>) => Set<'quest' | 'task' | 'routine'>) => void
  plannerIncludeUndated: boolean
  setPlannerIncludeUndated: (v: boolean) => void
  plannerPriorities: Set<string>
  setPlannerPriorities: (fn: (prev: Set<string>) => Set<string>) => void
  draggedItem: any
  setDraggedItem: (i: any) => void
  areas: Area[]
  quests: Quest[]
  routines: Routine[]
  allTasks: Task[]
  doneRoutineIds: Set<string>
  delivsByProject: Record<string, Deliverable[]>
  dayPeriods: DayPeriods
  onClose: () => void
}) {
  const availableItems = filteredItems.filter(item =>
    !dayPlan.morning.includes(item.id) &&
    !dayPlan.afternoon.includes(item.id) &&
    !dayPlan.evening.includes(item.id)
  )
  const draggedFromPeriod = draggedItem && (
    dayPlan.morning.includes(draggedItem.id) ||
    dayPlan.afternoon.includes(draggedItem.id) ||
    dayPlan.evening.includes(draggedItem.id)
  )

  const typeChips: { key: 'quest' | 'task' | 'routine'; label: string }[] = [
    { key: 'quest', label: 'Quests' },
    { key: 'task', label: 'Tarefas' },
    { key: 'routine', label: 'Rotinas' },
  ]

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          zIndex: 998,
          animation: 'dia-fade-in 0.2s ease-out',
        }}
      />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--color-bg-secondary)',
        borderTop: '1px solid var(--color-border)',
        zIndex: 999, maxHeight: '82vh',
        display: 'flex', flexDirection: 'column',
        animation: 'dia-slide-up 0.25s ease-out',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 32px', borderBottom: '1px solid var(--color-divider)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontSize: 10, color: 'var(--color-text-tertiary)',
              letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
              marginBottom: 2,
            }}>
              Planejar
            </div>
            <div style={{ fontSize: 16, color: 'var(--color-text-primary)', fontWeight: 600 }}>
              Distribuir itens pelos períodos do dia
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', padding: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Filtros */}
        <div style={{
          padding: '14px 32px', borderBottom: '1px solid var(--color-divider)',
          display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          background: 'var(--color-bg-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
              Janela
            </span>
            <DateRangeFilter value={plannerRange} onChange={setPlannerRange} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
              Tipos
            </span>
            {typeChips.map(t => {
              const active = plannerTypes.has(t.key)
              return (
                <button
                  key={t.key}
                  onClick={e => setPlannerTypes(prev => {
                    // Shift+click: seleciona SÓ este (solo). Click normal: toggle.
                    if (e.shiftKey) return new Set([t.key])
                    const next = new Set(prev)
                    if (next.has(t.key)) next.delete(t.key); else next.add(t.key)
                    return next
                  })}
                  title={`${t.label} · shift+clique pra isolar`}
                  style={{
                    background: 'transparent',
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 10, padding: '3px 4px',
                    letterSpacing: '0.08em', textTransform: 'lowercase',
                    fontWeight: active ? 700 : 400,
                    transition: 'color 0.12s',
                    opacity: active ? 1 : 0.55,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.opacity = '0.55' }}
                >
                  {t.label.toLowerCase()}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, marginRight: 3 }}>
              Prioridade
            </span>
            {([
              { key: 'critical', label: 'crítica', color: 'var(--color-accent-primary)' },
              { key: 'high',     label: 'alta',    color: 'var(--color-warning)' },
              { key: 'medium',   label: 'média',   color: 'var(--color-accent-light)' },
              { key: 'low',      label: 'baixa',   color: 'var(--color-text-tertiary)' },
            ]).map(p => {
              const active = plannerPriorities.has(p.key)
              return (
                <button
                  key={p.key}
                  onClick={e => setPlannerPriorities(prev => {
                    if (e.shiftKey) return new Set([p.key])
                    const next = new Set(prev)
                    if (next.has(p.key)) next.delete(p.key); else next.add(p.key)
                    return next
                  })}
                  title={`${p.label} · shift+clique pra isolar`}
                  style={{
                    background: 'transparent',
                    color: active ? p.color : 'var(--color-text-muted)',
                    border: 'none', cursor: 'pointer',
                    fontSize: 10, padding: '3px 6px',
                    letterSpacing: '0.05em', textTransform: 'lowercase',
                    fontWeight: active ? 700 : 400,
                    transition: 'color 0.12s, opacity 0.12s',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    opacity: active ? 1 : 0.5,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.opacity = '0.5' }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: p.color,
                    opacity: active ? 1 : 0.6,
                  }} />
                  {p.label}
                </button>
              )
            })}
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
          }}>
            <input
              type="checkbox"
              checked={plannerIncludeUndated}
              onChange={e => setPlannerIncludeUndated(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              incluir sem data
            </span>
          </label>
        </div>

        {/* Body: disponíveis × períodos */}
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          overflow: 'hidden',
        }}>

          {/* Disponíveis */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (draggedItem) {
                setDayPlan(prev => ({
                  morning: prev.morning.filter((id: string) => id !== draggedItem.id),
                  afternoon: prev.afternoon.filter((id: string) => id !== draggedItem.id),
                  evening: prev.evening.filter((id: string) => id !== draggedItem.id),
                }))
              }
            }}
            style={{
              borderRight: '1px solid var(--color-divider)',
              overflowY: 'auto', padding: '18px 24px',
              background: draggedFromPeriod ? 'rgba(90, 122, 106, 0.06)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <div style={{
              fontSize: 10, color: 'var(--color-text-tertiary)',
              letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
              marginBottom: 14,
            }}>
              Disponíveis ({availableItems.length})
            </div>
            {availableItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {availableItems.map(item => (
                  <AvailableCard
                    key={item.id}
                    item={item}
                    areas={areas}
                    quests={quests}
                    delivsByProject={delivsByProject}
                    onDragStart={() => setDraggedItem(item)}
                    onDragEnd={() => setDraggedItem(null)}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
                padding: '16px 0',
              }}>
                {filteredItems.length === 0
                  ? 'Nada neste filtro.'
                  : 'Tudo foi planejado.'}
              </div>
            )}
          </div>

          {/* Períodos */}
          <div style={{
            overflowY: 'auto', padding: '18px 24px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {(['morning', 'afternoon', 'evening'] as const).map(period => {
              const META = {
                morning: { Icon: Sunrise, label: 'Manhã' },
                afternoon: { Icon: Sun, label: 'Tarde' },
                evening: { Icon: Moon, label: 'Noite' },
              }[period]

              const allItemsPool = [
                ...quests,
                ...routines.map(r => ({ ...r, isRoutine: true, done: doneRoutineIds.has(r.id) })),
                ...allTasks.map(t => ({ ...t, isTask: true })),
              ]
              // Renderiza NA ORDEM do dayPlan pra refletir reordenação por drag.
              const periodItems = dayPlan[period]
                .map(id => allItemsPool.find(it => it.id === id))
                .filter((it): it is any => !!it)

              // Capacidade do período = janela (start→end) menos overlap com
              // blocos improdutivos do usuário. Mesma matemática da PeriodSection
              // fora do drawer — usuário vê o mesmo número nos dois lugares.
              const periodRangesMin = periodRangesMinFrom(dayPeriods)
              const [startMin, endMin] = periodRangesMin[period]
              const totalPeriodMin = endMin - startMin
              let unproductiveMin = 0
              try {
                const saved = localStorage.getItem('hq-unproductive-blocks')
                if (saved) {
                  const ranges = getAllBlockRangesForDay(JSON.parse(saved), new Date())
                  unproductiveMin = ranges.reduce((sum, r) => {
                    const blockStartMin = r.start * 60
                    const blockEndMin = r.end * 60
                    const overlapStart = Math.max(blockStartMin, startMin)
                    const overlapEnd = Math.min(blockEndMin, endMin)
                    return sum + Math.max(0, overlapEnd - overlapStart)
                  }, 0)
                }
              } catch {}
              const availableMin = Math.max(0, totalPeriodMin - unproductiveMin)
              const usedMin = periodItems.reduce((s, it) => s + itemDurationMin(it), 0)
              const remainingMin = availableMin - usedMin
              const isExceeded = remainingMin < 0
              const metricColor = isExceeded ? 'var(--color-accent-primary)' : 'var(--color-success)'

              return (
                <div
                  key={period}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    // Move o item pra esse período: remove de qualquer outro e
                    // adiciona aqui. Se já estava aqui, é no-op.
                    if (!draggedItem) return
                    setDayPlan(prev => {
                      if (prev[period].includes(draggedItem.id)) return prev
                      return {
                        morning:   prev.morning.filter((id: string) => id !== draggedItem.id),
                        afternoon: prev.afternoon.filter((id: string) => id !== draggedItem.id),
                        evening:   prev.evening.filter((id: string) => id !== draggedItem.id),
                        [period]: [...prev[period].filter((id: string) => id !== draggedItem.id), draggedItem.id],
                      } as any
                    })
                  }}
                  style={{
                    border: draggedItem && !dayPlan[period].includes(draggedItem.id)
                      ? '1px dashed var(--color-accent-primary)'
                      : isExceeded
                        ? '1px solid var(--color-accent-primary)'
                        : '1px solid var(--color-border)',
                    borderRadius: 3, padding: '12px 14px',
                    transition: 'border-color 0.15s',
                    display: 'flex', flexDirection: 'column', flexShrink: 0,
                    background: 'var(--color-bg-secondary)',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                  }}>
                    <META.Icon size={11} strokeWidth={1.8} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div style={{
                      fontSize: 10, color: 'var(--color-text-tertiary)',
                      letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600,
                    }}>
                      {META.label}
                    </div>
                    <div style={{
                      fontSize: 9, color: 'var(--color-text-muted)',
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}>
                      {minutesToHHMM(startMin)}–{minutesToHHMM(endMin)}
                    </div>
                    <div style={{ flex: 1 }} />
                    <div
                      title={`${fmtHM(usedMin)} usado de ${fmtHM(availableMin)} disponível`}
                      style={{
                        fontSize: 10, color: metricColor,
                        fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
                      }}
                    >
                      {isExceeded
                        ? `−${fmtHM(Math.abs(remainingMin))}`
                        : `+${fmtHM(remainingMin)} livre`}
                    </div>
                  </div>

                  {periodItems.length > 0 ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 4,
                      maxHeight: 180, overflowY: 'auto',
                      paddingRight: 2,
                    }}>
                      {periodItems.map(item => {
                        const itemDone = itemIsDone(item)
                        return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDraggedItem(item)}
                          onDragEnd={() => setDraggedItem(null)}
                          onDragOver={e => {
                            if (!draggedItem || draggedItem.id === item.id) return
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          onDrop={e => {
                            // Drop em cima deste item: insere o arrastado ANTES dele,
                            // reordenando dentro do período (ou trazendo de outro).
                            if (!draggedItem || draggedItem.id === item.id) return
                            e.stopPropagation()
                            e.preventDefault()
                            setDayPlan(prev => {
                              const next = {
                                morning:   prev.morning.filter((id: string) => id !== draggedItem.id),
                                afternoon: prev.afternoon.filter((id: string) => id !== draggedItem.id),
                                evening:   prev.evening.filter((id: string) => id !== draggedItem.id),
                              }
                              const targetList = [...next[period]]
                              const idx = targetList.indexOf(item.id)
                              targetList.splice(idx >= 0 ? idx : targetList.length, 0, draggedItem.id)
                              return { ...next, [period]: targetList } as any
                            })
                          }}
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 2, padding: '6px 8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 6, cursor: 'grab',
                            fontSize: 11, color: 'var(--color-text-secondary)',
                            transition: 'opacity 0.15s, border-color 0.15s',
                            opacity: itemDone ? 0.5 : 1,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = itemDone ? '0.65' : '0.85')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = itemDone ? '0.5' : '1')}
                        >
                          <span style={{
                            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            textDecoration: itemDone ? 'line-through' : 'none',
                          }}>
                            {item.title}
                          </span>
                          <button
                            onClick={() => setDayPlan(prev => ({
                              ...prev,
                              [period]: prev[period].filter((id: string) => id !== item.id),
                            }))}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--color-text-muted)', fontSize: 10,
                              padding: '0 4px', transition: 'color 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                          >
                            ✕
                          </button>
                        </div>
                      )})}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: 10, color: 'var(--color-text-muted)',
                      fontStyle: 'italic', textAlign: 'center', padding: '8px 0',
                    }}>
                      arraste aqui
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 32px', borderTop: '1px solid var(--color-divider)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: 'var(--color-bg-primary)',
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
              padding: '8px 18px', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              borderRadius: 3, transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-text-primary)'
              e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            Fechar
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'var(--color-accent-primary)', border: 'none',
              color: 'var(--color-bg-primary)', cursor: 'pointer',
              padding: '8px 18px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              borderRadius: 3, transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-accent-primary)')}
          >
            Concluir
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dia-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes dia-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  )
}

// ─── AvailableCard ─────────────────────────────────────────────────────────

// ─── OverdueTasksBanner ────────────────────────────────────────────────────

/**
 * Banner compacto no topo do Dia listando tarefas agendadas em dias passados
 * que não foram feitas. Rotinas e quests ficam de fora — rotinas não
 * acumulam dívida (cada dia é instância nova) e quests não têm data própria.
 */
function OverdueTasksBanner({ tasks, onToToday, onReschedule, onDiscard }: {
  tasks: Task[]
  onToToday: (t: Task) => void
  onReschedule: (t: Task, newDate: string) => void
  onDiscard: (t: Task) => void
}) {
  const [picking, setPicking] = useState<string | null>(null)
  const [pickValue, setPickValue] = useState<string>('')

  function daysAway(iso: string | null | undefined): string {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
    if (diff === 1) return 'ontem'
    return `${diff}d atrás`
  }

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
      }}>
        <div style={{
          fontSize: 10, color: 'var(--color-accent-light)',
          letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
        }}>
          Pendentes de ontem · {tasks.length}
        </div>
      </div>

      <div style={{
        border: '1px solid var(--color-border)',
        borderLeft: '2px solid var(--color-accent-primary)',
        borderRadius: 3, background: 'var(--color-bg-secondary)',
      }}>
        {tasks.map((t, i) => {
          const isPicking = picking === t.id
          return (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px',
                borderTop: i > 0 ? '1px solid var(--color-divider)' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.title}
                </div>
                <div style={{
                  fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2,
                  fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em',
                }}>
                  {daysAway(t.scheduled_date)}
                  {t.duration_minutes ? ` · ~${t.duration_minutes}min` : ''}
                </div>
              </div>

              {isPicking ? (
                <>
                  <input
                    type="date"
                    value={pickValue}
                    onChange={e => setPickValue(e.target.value)}
                    style={{
                      background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)', fontSize: 11, padding: '4px 6px', borderRadius: 3,
                      outline: 'none', colorScheme: 'dark', fontFamily: "'IBM Plex Mono', monospace",
                    } as any}
                  />
                  <button
                    onClick={() => {
                      if (pickValue) {
                        onReschedule(t, pickValue)
                        setPicking(null)
                        setPickValue('')
                      }
                    }}
                    disabled={!pickValue}
                    style={{
                      background: pickValue ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                      color: pickValue ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                      border: 'none', cursor: pickValue ? 'pointer' : 'not-allowed',
                      fontSize: 9, fontWeight: 700, padding: '4px 10px',
                      letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 3,
                    }}
                  >
                    ok
                  </button>
                  <button
                    onClick={() => { setPicking(null); setPickValue('') }}
                    title="Cancelar"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', padding: 4,
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onToToday(t)}
                    title="Reagendar pra hoje"
                    style={{
                      background: 'transparent', border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)', cursor: 'pointer',
                      fontSize: 9, fontWeight: 600, padding: '4px 10px',
                      letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 3,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                      e.currentTarget.style.color = 'var(--color-accent-light)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                    }}
                  >
                    <ArrowRight size={10} strokeWidth={2} />
                    pra hoje
                  </button>
                  <button
                    onClick={() => {
                      setPicking(t.id)
                      setPickValue(t.scheduled_date ?? '')
                    }}
                    title="Escolher nova data"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', padding: 4,
                      display: 'inline-flex', alignItems: 'center',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                  >
                    <CalendarIcon size={13} strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => onDiscard(t)}
                    title="Descartar"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-muted)', padding: 4,
                      display: 'inline-flex', alignItems: 'center',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── AvailableCard ─────────────────────────────────────────────────────────

function itemIsDone(item: any): boolean {
  if (item?.isTask) return !!item.done
  if (item?.isRoutine) return !!item.done
  return item?.status === 'done'
}

function AvailableCard({ item, areas, quests, delivsByProject, onDragStart, onDragEnd }: {
  item: any
  areas: Area[]
  quests: Quest[]
  delivsByProject: Record<string, Deliverable[]>
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const isRoutine = !!item.isRoutine
  const isTask = !!item.isTask
  const done = itemIsDone(item)
  const area = !isTask && !isRoutine
    ? areas.find(a => a.slug === (item as Quest).area_slug)
    : null
  const color = isTask
    ? 'var(--color-gold)'
    : isRoutine
      ? 'var(--color-routine-block)'
      : (area?.color ?? 'var(--color-text-tertiary)')

  const duration = itemDurationMin(item)
  // Quests são sempre subtasks agora; procura projeto pai + entregável.
  const parent = !isTask && !isRoutine && (item as Quest).parent_id
    ? quests.find(p => p.id === (item as Quest).parent_id)
    : null
  const deliverable = parent && (item as Quest).deliverable_id
    ? delivsByProject[parent.id]?.find(d => d.id === (item as Quest).deliverable_id)
    : null
  // Tipo primário no topo: pra quest = nome da área; pra tarefa/rotina = rótulo.
  const typeLabel = isTask ? 'Tarefa' : isRoutine ? 'Rotina' : (area?.name ?? (item as Quest).area_slug)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 3, padding: '8px 10px',
        cursor: 'grab', transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
        opacity: done ? 0.5 : 1,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--color-bg-primary)'
        e.currentTarget.style.borderColor = color
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--color-bg-tertiary)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      <div style={{
        fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {item.title}
      </div>
      <div style={{
        marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        fontSize: 9, color: 'var(--color-text-tertiary)',
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        <span style={{ color, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          {typeLabel}
        </span>
        {parent && (
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            › {parent.title}
          </span>
        )}
        {deliverable && (
          <span style={{ color: 'var(--color-text-muted)' }}>
            › {deliverable.title}
          </span>
        )}
        {duration > 0 && (
          <span>· ~{fmtHM(duration)}</span>
        )}
        {isTask && (item as any).start_time && (item as any).end_time && (
          <span>· {(item as any).start_time}–{(item as any).end_time}</span>
        )}
      </div>
    </div>
  )
}

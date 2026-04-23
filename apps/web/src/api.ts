import type { DayData, Quest, Area, Routine, MicroTask, Profile, Task } from './types'

// URL base do backend. Default aponta pro backend local padrão; pode ser
// sobrescrito em build via `VITE_API_URL` (ex: `.env` com `VITE_API_URL=http://192.168.x.y:8001`).
export const BASE: string = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8001'

/** Logger centralizado pra erros de API. Não silencia nada — `console.warn`
 *  com contexto. Deixe `.catch(err => reportApiError('nomeDaAcao', err))`
 *  em vez de `.catch(() => {})` pra manter visibilidade em DevTools. */
export function reportApiError(context: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[api] ${context} falhou:`, err)
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export const fetchToday = () => get<DayData>('/api/day/today')
export const fetchQuests = (area?: string) =>
  get<Quest[]>(area ? `/api/quests?area=${area}` : '/api/quests')
export const fetchSubtasks = (parentId: string) =>
  get<Quest[]>(`/api/quests?parent_id=${parentId}`)
export const fetchAreas = () => get<Area[]>('/api/areas')

export async function createArea(body: { name: string; description?: string; color?: string; slug?: string }): Promise<Area> {
  const res = await fetch(`${BASE}/api/areas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function updateArea(slug: string, patch: Partial<{ name: string; description: string; color: string; sort_order: number }>): Promise<Area> {
  const res = await fetch(`${BASE}/api/areas/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteArea(slug: string): Promise<void> {
  const res = await fetch(`${BASE}/api/areas/${slug}`, { method: 'DELETE' })
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}))
    const err: any = new Error('409')
    err.detail = data.detail ?? 'Área tem quests vinculadas'
    throw err
  }
  if (!res.ok) throw new Error(`API error ${res.status}`)
}

export const fetchProfile = () => get<Profile>('/api/profile')

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const res = await fetch(`${BASE}/api/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function fetchTasks(opts?: { done?: boolean; date?: string }): Promise<Task[]> {
  const params = new URLSearchParams()
  if (opts?.done !== undefined) params.set('done', String(opts.done))
  if (opts?.date) params.set('date', opts.date)
  const qs = params.toString()
  return get<Task[]>(`/api/tasks${qs ? '?' + qs : ''}`)
}

export async function createTask(body: {
  title: string
  priority: string
  scheduled_date?: string | null
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
}): Promise<Task> {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function updateTask(id: string, patch: Partial<{
  title: string
  scheduled_date: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  done: boolean
  description: string | null
}>): Promise<Task> {
  const res = await fetch(`${BASE}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function toggleTask(id: string): Promise<Task> {
  const res = await fetch(`${BASE}/api/tasks/${id}/toggle`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/tasks/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}

// Task sessions (play/pause/resume/stop + history)

export interface TaskSession {
  id: number
  task_id: string
  session_num: number
  started_at: string
  ended_at: string | null
}

export const fetchTaskSessions = (taskId: string) =>
  get<TaskSession[]>(`/api/tasks/${taskId}/sessions`)

async function sessionPostConflict(url: string): Promise<any> {
  const res = await fetch(url, { method: 'POST' })
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}))
    const err: any = new Error('409')
    err.conflictTitle = data.detail
    throw err
  }
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export const startTaskSession = (id: string) =>
  sessionPostConflict(`${BASE}/api/tasks/${id}/sessions/start`) as Promise<TaskSession>
export const pauseTaskSession = (id: string) =>
  sessionPostConflict(`${BASE}/api/tasks/${id}/sessions/pause`) as Promise<TaskSession>
export const resumeTaskSession = (id: string) =>
  sessionPostConflict(`${BASE}/api/tasks/${id}/sessions/resume`) as Promise<TaskSession>
export const stopTaskSession = (id: string) =>
  sessionPostConflict(`${BASE}/api/tasks/${id}/sessions/stop`) as Promise<Task>

// Routine sessions (play/pause/resume/stop + history by date)

export interface RoutineSession {
  id: number
  routine_id: string
  date: string
  session_num: number
  started_at: string
  ended_at: string | null
}

export const fetchRoutineSessions = (routineId: string, target?: string) => {
  const qs = target ? `?target=${target}` : ''
  return get<RoutineSession[]>(`/api/routines/${routineId}/sessions${qs}`)
}

export const startRoutineSession = (id: string, target?: string) =>
  sessionPostConflict(`${BASE}/api/routines/${id}/sessions/start${target ? '?target=' + target : ''}`) as Promise<RoutineSession>
export const pauseRoutineSession = (id: string, target?: string) =>
  sessionPostConflict(`${BASE}/api/routines/${id}/sessions/pause${target ? '?target=' + target : ''}`) as Promise<RoutineSession>
export const resumeRoutineSession = (id: string, target?: string) =>
  sessionPostConflict(`${BASE}/api/routines/${id}/sessions/resume${target ? '?target=' + target : ''}`) as Promise<RoutineSession>
export const stopRoutineSession = (id: string, target?: string) =>
  sessionPostConflict(`${BASE}/api/routines/${id}/sessions/stop${target ? '?target=' + target : ''}`) as Promise<{ status: string; routine_id: string; date: string; done: boolean }>

export const fetchRoutines = () => get<Routine[]>('/api/routines')

export async function toggleRoutine(id: string): Promise<Routine> {
  const res = await fetch(`${BASE}/api/routines/${id}/toggle`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function fetchAllRoutines(): Promise<Routine[]> {
  return get<Routine[]>('/api/routines/all')
}

/** Rotinas que aplicam num dia específico (YYYY-MM-DD), com `done` preenchido
 *  pelo backend consultando routine_logs daquele dia. */
export async function fetchRoutinesForDate(targetIso: string): Promise<Routine[]> {
  return get<Routine[]>(`/api/routines?target=${encodeURIComponent(targetIso)}`)
}

export interface RoutineCompletionStats {
  from: string
  to: string
  days: number
  expected: number
  completed: number
  rate: number
}

export async function fetchRoutineCompletionStats(from: string, to: string): Promise<RoutineCompletionStats> {
  return get<RoutineCompletionStats>(`/api/routines/completion-stats?from=${from}&to=${to}`)
}

export async function createRoutine(body: Omit<Routine, 'id' | 'done'>): Promise<Routine> {
  const res = await fetch(`${BASE}/api/routines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function updateRoutine(id: string, body: Partial<Routine>): Promise<Routine> {
  const res = await fetch(`${BASE}/api/routines/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteRoutine(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/routines/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}


export async function createQuest(body: { title: string; area_slug: string; priority?: string; parent_id?: string; deliverable_id?: string; estimated_minutes?: number; description?: string | null }): Promise<Quest> {
  const res = await fetch(`${BASE}/api/quests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    let detail: string | undefined
    try { detail = JSON.parse(text).detail } catch {}
    const err: any = new Error(detail || `API error ${res.status}`)
    err.status = res.status
    err.detail = detail
    throw err
  }
  return res.json()
}

export async function patchQuest(id: string, body: Partial<Quest>): Promise<Quest> {
  const res = await fetch(`${BASE}/api/quests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteQuest(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/quests/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}

export interface QuestSession {
  id: number
  quest_id: string
  session_num: number
  started_at: string
  ended_at: string | null
}

export const fetchSessions = (questId: string) => get<QuestSession[]>(`/api/quests/${questId}/sessions`)

export interface ActiveSession {
  type: 'quest' | 'task' | 'routine'
  id: string
  title: string
  area_slug: string | null
  started_at: string
  ended_at: string | null
  is_active: boolean
  /** @deprecated */
  quest_id?: string | null
}

export const fetchActiveSession = async (focused?: { type: string; id: string } | null): Promise<ActiveSession | null> => {
  const params = new URLSearchParams()
  if (focused) {
    params.set('focused_type', focused.type)
    params.set('focused_id', focused.id)
  }
  const qs = params.toString()
  const res = await fetch(`${BASE}/api/sessions/active${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function startSession(questId: string): Promise<QuestSession> {
  const res = await fetch(`${BASE}/api/quests/${questId}/sessions/start`, { method: 'POST' })
  if (res.status === 409) {
    const data = await res.json()
    const err: any = new Error('409')
    err.conflictTitle = data.detail
    throw err
  }
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function pauseSession(questId: string): Promise<QuestSession> {
  const res = await fetch(`${BASE}/api/quests/${questId}/sessions/pause`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function resumeSession(questId: string): Promise<QuestSession> {
  const res = await fetch(`${BASE}/api/quests/${questId}/sessions/resume`, { method: 'POST' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// Deliverables
export interface Deliverable {
  id: string
  quest_id: string
  title: string
  done: boolean
  sort_order: number
  estimated_minutes?: number
  minutes_worked?: number
}

export const fetchDeliverables = (questId: string) => get<Deliverable[]>(`/api/quests/${questId}/deliverables`)

export async function createDeliverable(
  questId: string,
  title: string,
  opts?: { estimatedMinutes?: number; deadline?: string | null },
): Promise<Deliverable> {
  const payload: any = { title }
  if (opts?.estimatedMinutes !== undefined) payload.estimated_minutes = opts.estimatedMinutes
  if (opts?.deadline !== undefined) payload.deadline = opts.deadline

  const res = await fetch(`${BASE}/api/quests/${questId}/deliverables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const error = await res.text()
    console.error('API error response:', error)
    throw new Error(`API error ${res.status}: ${error}`)
  }
  return res.json()
}

export async function updateDeliverable(delivId: string, data: any): Promise<Deliverable> {
  const res = await fetch(`${BASE}/api/deliverables/${delivId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteDeliverable(delivId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/deliverables/${delivId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const text = await res.text()
    let detail: string | undefined
    try { detail = JSON.parse(text).detail } catch {}
    const err: any = new Error(detail || `API error ${res.status}`)
    err.status = res.status
    err.detail = detail
    throw err
  }
}

export async function reorderDeliverables(questId: string, delivIds: string[]): Promise<any> {
  const res = await fetch(`${BASE}/api/quests/${questId}/deliverables/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliv_ids: delivIds }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// Micro Tasks
export const fetchMicroTasks = () => get<MicroTask[]>('/api/micro-tasks')

export async function createMicroTask(title: string): Promise<MicroTask> {
  const res = await fetch(`${BASE}/api/micro-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteMicroTask(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/micro-tasks/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}

// Google Calendar integration
export async function createCalendarEvent(questId: string, title: string, startTime: string, endTime?: string): Promise<any> {
  const res = await fetch(`${BASE}/api/calendar/create-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quest_id: questId, title, start_time: startTime, end_time: endTime }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function updateCalendarEvent(eventId: string, data: any): Promise<any> {
  const res = await fetch(`${BASE}/api/calendar/update-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, ...data }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function deleteCalendarEvent(eventId: string): Promise<any> {
  const res = await fetch(`${BASE}/api/calendar/delete-event?event_id=${eventId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

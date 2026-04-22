export interface Quest {
  id: string
  parent_id: string | null
  title: string
  area_slug: string
  status: string
  priority: string
  deadline: string | null
  estimated_minutes: number | null
  next_action: string | null
  description?: string | null
  notes?: string | null
  deliverable_id?: string | null
  calendar_event_id?: string | null
  completed_at?: string | null
  /** Soma das sessões fechadas (em minutos), independente de status. */
  worked_minutes?: number
}

export interface Area {
  slug: string
  name: string
  description: string
  color: string
}

export interface CalendarEvent {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  is_all_day: boolean
  location: string | null
}

export interface FreeWindow {
  starts_at: string
  ends_at: string
  duration_minutes: number
}

export interface Routine {
  id: string
  title: string
  recurrence: string
  day_of_week: number | null
  days_of_week: string | null
  day_of_month: number | null
  start_time: string | null
  end_time: string | null
  estimated_minutes: number | null
  calendar_event_id: string | null
  done: boolean
  /** 'critical' | 'high' | 'medium' | 'low' — obrigatório na criação. */
  priority: string
}

export interface DayData {
  date: string
  timezone: string
  events: CalendarEvent[]
  free_windows: FreeWindow[]
  total_free_minutes: number
}

export interface Deliverable {
  id: string
  quest_id: string
  title: string
  done: boolean
  sort_order: number
  estimated_minutes?: number | null
  deadline?: string | null
  /** Legado: antes a API incrementava isso no `status='done'`. Não usar. */
  minutes_worked?: number
  /** Soma dinâmica de sessões fechadas das quests **done** amarradas. */
  executed_minutes?: number
}

export interface ActiveSession {
  type: 'quest' | 'task' | 'routine'
  id: string
  title: string
  area_slug: string | null
  started_at: string
  ended_at: string | null
  is_active: boolean
  /** Nome do projeto pai quando `type='quest'` e é subtarefa. */
  parent_title?: string | null
  /** Nome do entregável quando `type='quest'` e é subtarefa amarrada. */
  deliverable_title?: string | null
  /** @deprecated use `id` + `type`. Kept for back-compat with older UI code. */
  quest_id?: string | null
}

export interface MicroTask {
  id: string
  title: string
  created_at: string
}

export interface Profile {
  name: string
  role: string
  avatar_url: string
}

export interface Task {
  id: string
  title: string
  scheduled_date: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  done: boolean
  completed_at: string | null
  sort_order: number
  /** 'critical' | 'high' | 'medium' | 'low' — obrigatório na criação. */
  priority: string
}

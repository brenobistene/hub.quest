/**
 * Notion-style date range presets shared by every place that filters by date
 * (Quests concluídas, Áreas concluídas, Tarefas concluídas, Rotinas
 * cumpridas no Dashboard, planejador na tela Dia, etc).
 */

import { parseIsoAsUtc, startOfLocalDay, endOfLocalDay, isoToLocalYmd } from './datetime'

export type DatePreset =
  | 'today'
  | '7d'
  | '30d'
  | 'all'
  | 'custom'

export interface DateRange {
  preset: DatePreset
  from: Date | null
  to: Date | null
  customFrom?: string
  customTo?: string
}

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'hoje',
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
  all: 'tudo',
  custom: 'customizado',
}

export function computeRange(preset: DatePreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date()
  if (preset === 'today') {
    return { preset, from: startOfLocalDay(now), to: endOfLocalDay(now) }
  }
  if (preset === '7d' || preset === '30d') {
    const days = preset === '7d' ? 6 : 29
    const from = new Date(now)
    from.setDate(now.getDate() - days)
    return { preset, from: startOfLocalDay(from), to: endOfLocalDay(now) }
  }
  if (preset === 'custom') {
    const from = customFrom ? startOfLocalDay(new Date(customFrom + 'T00:00:00')) : null
    const to = customTo ? endOfLocalDay(new Date(customTo + 'T00:00:00')) : null
    return { preset, from, to, customFrom, customTo }
  }
  return { preset: 'all', from: null, to: null }
}

export function isInRange(iso: string | null | undefined, range: DateRange): boolean {
  if (range.from === null && range.to === null) return true
  if (!iso) return false
  const d = parseIsoAsUtc(iso)
  if (isNaN(d.getTime())) return false
  if (range.from && d < range.from) return false
  if (range.to && d > range.to) return false
  return true
}

export function rangeLabel(range: DateRange): string {
  if (range.preset !== 'custom') return DATE_PRESET_LABELS[range.preset]
  if (range.from && range.to) {
    const f = isoToLocalYmd(range.from)
    const t = isoToLocalYmd(range.to)
    return `${f.slice(8)}/${f.slice(5, 7)} – ${t.slice(8)}/${t.slice(5, 7)}`
  }
  return 'customizado'
}

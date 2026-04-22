/**
 * Quest-related constants shared across components.
 * Keep these in sync with the backend enums (status, priority).
 */

import type { Area } from '../types'

/** Human label per status key. */
export const STATUS_LABEL: Record<string, string> = {
  doing: 'fazendo',
  pending: 'pendente',
  done: 'feito',
  waiting: 'aguardando',
}

/** Ordered status list used by dropdowns. */
export const STATUSES: { key: string; label: string }[] = [
  { key: 'pending', label: 'pendente' },
  { key: 'doing', label: 'fazendo' },
  { key: 'waiting', label: 'esperando' },
  { key: 'done', label: 'feito' },
]

/** Color dot per priority. `critical` → red-ish; `low` → muted. */
export const PRIORITY_DOT: Record<string, string> = {
  critical: 'var(--color-accent-vivid)',
  high: 'var(--color-accent-light)',
  medium: 'var(--color-success-light)',
  low: 'var(--color-text-muted)',
}

export function getAreaColor(areaSlug: string, areas: Area[]): string {
  const area = areas.find(a => a.slug === areaSlug)
  return area?.color ?? '#6b7280'
}

/** Format an ISO date as DD/MM/YY (local). */
export function formatDateBR(iso: string | null): string {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year.slice(-2)}`
}

/** Human deadline distance: "hoje" / "amanhã" / "3d" / "atrasado 2d". */
export function fmtDeadline(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  const today = new Date()
  const diff = Math.ceil((d.getTime() - today.setHours(0, 0, 0, 0)) / 86400000)
  if (diff < 0) return `atrasado ${Math.abs(diff)}d`
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  return `${diff}d`
}

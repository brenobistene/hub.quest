/**
 * User-configurable day periods (manhã/tarde/noite). Stored locally in
 * `localStorage['hq-day-periods']` as minutes from 00:00.
 *
 * Defaults cover the full 24h (morning from midnight, night until midnight)
 * so no hour is lost; user can shift the cutoffs through a modal.
 */

export interface DayPeriods {
  morningStart: number
  afternoonStart: number
  eveningStart: number
}

export const DEFAULT_DAY_PERIODS: DayPeriods = {
  morningStart: 0,
  afternoonStart: 12 * 60,
  eveningStart: 18 * 60,
}

export function loadDayPeriods(): DayPeriods {
  try {
    const raw = localStorage.getItem('hq-day-periods')
    if (!raw) return DEFAULT_DAY_PERIODS
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.morningStart === 'number' &&
      typeof parsed.afternoonStart === 'number' &&
      typeof parsed.eveningStart === 'number' &&
      parsed.morningStart >= 0 && parsed.morningStart <= 1440 &&
      parsed.afternoonStart > parsed.morningStart && parsed.afternoonStart <= 1440 &&
      parsed.eveningStart > parsed.afternoonStart && parsed.eveningStart <= 1440
    ) return parsed
  } catch {}
  return DEFAULT_DAY_PERIODS
}

export function saveDayPeriods(p: DayPeriods) {
  try { localStorage.setItem('hq-day-periods', JSON.stringify(p)) } catch {}
}

/** `[startMin, endMin)` for each period. `evening` always ends at 1440. */
export function periodRangesMinFrom(p: DayPeriods): Record<string, [number, number]> {
  return {
    morning: [p.morningStart, p.afternoonStart],
    afternoon: [p.afternoonStart, p.eveningStart],
    evening: [p.eveningStart, 1440],
  }
}

export function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function hhmmToMinutes(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 24 || min < 0 || min > 59) return null
  const total = h * 60 + min
  if (total > 1440) return null
  return total
}

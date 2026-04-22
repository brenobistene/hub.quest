/**
 * Date/time helpers shared across the app.
 *
 * The backend writes timestamps as UTC ISO strings ending in `Z`, but legacy
 * rows may lack the suffix. All parsing should go through `parseIsoAsUtc` so
 * both formats are normalized to UTC, avoiding "aware vs naive" arithmetic
 * errors.
 */

/** Parse an ISO timestamp tolerating missing `Z` by assuming UTC. */
export function parseIsoAsUtc(iso: string): Date {
  const hasTz = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTz ? iso : iso + 'Z')
}

/** Local day boundary — start (00:00:00.000). */
export function startOfLocalDay(d: Date): Date {
  const n = new Date(d)
  n.setHours(0, 0, 0, 0)
  return n
}

/** Local day boundary — end (23:59:59.999). */
export function endOfLocalDay(d: Date): Date {
  const n = new Date(d)
  n.setHours(23, 59, 59, 999)
  return n
}

/** Format a local Date as YYYY-MM-DD. */
export function isoToLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Total seconds across all closed sessions (sessions with both `started_at`
 * and `ended_at`). Used to display accumulated time on entities.
 */
export function sumClosedSessionsSeconds(
  sessions: { started_at: string; ended_at: string | null }[]
): number {
  let total = 0
  for (const s of sessions) {
    if (!s.ended_at) continue
    const st = parseIsoAsUtc(s.started_at).getTime()
    const en = parseIsoAsUtc(s.ended_at).getTime()
    if (!isNaN(st) && !isNaN(en) && en > st) total += Math.floor((en - st) / 1000)
  }
  return total
}

/** Format seconds as either `mm:ss` or `hh:mm:ss`. */
export function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

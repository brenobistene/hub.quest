import { useEffect, useState } from 'react'
import type { DateRange } from '../utils/dateRange'
import { computeRange } from '../utils/dateRange'
import { isoToLocalYmd } from '../utils/datetime'
import { fetchRoutineCompletionStats } from '../api'
import { DateRangeFilter } from './DateRangeFilter'

/**
 * "Rotinas cumpridas" bar on the Dashboard. Lets the user pick a date range
 * and shows the ratio of routines done vs expected in that window.
 * "tudo" (unbounded) returns no data — user must pick a concrete window.
 */
export function RoutineCompletionBar() {
  const [range, setRange] = useState<DateRange>(() => computeRange('today'))
  const [stats, setStats] = useState<{ expected: number; completed: number; rate: number } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!range.from || !range.to) {
      setStats(null)
      return
    }
    const from = isoToLocalYmd(range.from)
    const to = isoToLocalYmd(range.to)
    setLoading(true)
    fetchRoutineCompletionStats(from, to)
      .then(s => setStats({ expected: s.expected, completed: s.completed, rate: s.rate }))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [range.from?.getTime(), range.to?.getTime()])

  const pct = stats && stats.expected > 0 ? Math.round(stats.rate * 100) : 0
  const barColor = pct >= 75 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-accent-light)' : 'var(--color-accent-primary)'

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
          Rotinas cumpridas
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
            {stats ? `${pct}%` : loading ? '…' : '—'}
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>
      <div style={{
        height: 8,
        background: 'var(--color-bg-tertiary)',
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          transition: 'width 0.3s ease, background 0.3s ease',
        }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
        {stats
          ? (stats.expected > 0
              ? `${stats.completed} de ${stats.expected} ocorrências no período`
              : 'nenhuma rotina aplicável ao período')
          : (!range.from || !range.to
              ? 'escolha um período específico pra ver a taxa'
              : loading ? 'carregando…' : 'não foi possível carregar')}
      </div>
    </div>
  )
}

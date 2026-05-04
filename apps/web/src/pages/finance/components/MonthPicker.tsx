/**
 * Seletor de mês compartilhado entre as sub-páginas do Hub Finance.
 *
 * Botão `< [mês ano] >`: chevrons navegam ±1, click no label abre dropdown
 * com atalhos rápidos (hoje, mês anterior, ano passado mesmo mês) + grid
 * de 12 meses do ano com setas pra navegar entre anos.
 *
 * Usa `selectedMonth` do `useHubFinance()` — todas as sub-páginas do Hub
 * Finance ficam sincronizadas. Trocar o mês aqui afeta Visão Geral,
 * Lançamentos e Freelas simultaneamente.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface YearMonth {
  year: number
  month: number  // 1-12
}

export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_PT[month - 1]} ${year}`
}

export function shiftMonth(current: YearMonth, delta: number): YearMonth {
  let m = current.month + delta
  let y = current.year
  while (m < 1) { m += 12; y -= 1 }
  while (m > 12) { m -= 12; y += 1 }
  return { year: y, month: m }
}

export function MonthPicker({ selectedMonth, onChange, compact = false }: {
  selectedMonth: YearMonth
  onChange: (m: YearMonth) => void
  /** Versão menor — usar em headers densos. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const now = new Date()
  const todayYM: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const [pickerYear, setPickerYear] = useState(selectedMonth.year)

  useEffect(() => {
    if (open) setPickerYear(selectedMonth.year)
  }, [open, selectedMonth.year])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const isSelected = (ym: YearMonth) =>
    ym.year === selectedMonth.year && ym.month === selectedMonth.month
  const isToday = (ym: YearMonth) =>
    ym.year === todayYM.year && ym.month === todayYM.month

  function pick(ym: YearMonth) {
    onChange(ym)
    setOpen(false)
  }

  const monthLabel = formatMonthLabel(selectedMonth.year, selectedMonth.month)
  const yearAgo = shiftMonth(selectedMonth, -12)
  const monthAgo = shiftMonth(selectedMonth, -1)

  const iconSize = compact ? 12 : 13

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        padding: compact ? '4px 6px' : '6px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
      }}>
        <button
          type="button"
          onClick={() => onChange(shiftMonth(selectedMonth, -1))}
          style={iconBtnStyle}
          title="mês anterior"
          aria-label="mês anterior"
        >
          <ChevronLeft size={iconSize} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          title="abrir atalhos de mês"
          aria-label="abrir atalhos de mês"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: compact ? 'var(--text-xs)' : 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-primary)',
            minWidth: compact ? 90 : 110, textAlign: 'center',
            textTransform: 'capitalize',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            transition: 'background var(--motion-fast) var(--ease-smooth)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(shiftMonth(selectedMonth, 1))}
          style={iconBtnStyle}
          title="próximo mês"
          aria-label="próximo mês"
        >
          <ChevronRight size={iconSize} strokeWidth={2} />
        </button>
      </div>

      {open && (
        <div
          className="hq-glass-elevated hq-grain hq-animate-fade-up"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 100,
            minWidth: 280,
            padding: 'var(--space-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            boxShadow: 'var(--shadow-lg)',
            // Reforça opacidade — glass-elevated padrão deixa o card de
            // baixo aparecer demais, atrapalhando leitura.
            background: 'var(--color-bg-secondary)',
          }}
        >
          {/* Atalhos rápidos */}
          <PickerOption
            label="Hoje"
            sub={formatMonthLabel(todayYM.year, todayYM.month)}
            onClick={() => pick(todayYM)}
            highlighted={isSelected(todayYM)}
            primary
          />
          <PickerOption
            label="Mês anterior"
            sub={formatMonthLabel(monthAgo.year, monthAgo.month)}
            onClick={() => pick(monthAgo)}
          />
          <PickerOption
            label="Mesmo mês ano passado"
            sub={formatMonthLabel(yearAgo.year, yearAgo.month)}
            onClick={() => pick(yearAgo)}
          />

          <div style={{
            height: 1,
            background: 'var(--color-border)',
            margin: 'var(--space-1) 0',
          }} />

          {/* Year navigator + grid de meses */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px var(--space-2)',
          }}>
            <button
              type="button"
              onClick={() => setPickerYear(y => y - 1)}
              className="hq-icon-btn-bare"
              title="ano anterior"
              aria-label="ano anterior"
              style={{ minWidth: 'auto', minHeight: 'auto', padding: 4 }}
            >
              <ChevronLeft size={12} strokeWidth={1.8} />
            </button>
            <span style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {pickerYear}
            </span>
            <button
              type="button"
              onClick={() => setPickerYear(y => y + 1)}
              className="hq-icon-btn-bare"
              title="próximo ano"
              aria-label="próximo ano"
              style={{ minWidth: 'auto', minHeight: 'auto', padding: 4 }}
            >
              <ChevronRight size={12} strokeWidth={1.8} />
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--space-1)',
            padding: '0 var(--space-1)',
          }}>
            {MONTH_ABBR.map((abbr, i) => {
              const ym: YearMonth = { year: pickerYear, month: i + 1 }
              const sel = isSelected(ym)
              const isCurrentReal = isToday(ym)
              return (
                <button
                  key={abbr}
                  type="button"
                  onClick={() => pick(ym)}
                  style={{
                    background: sel ? 'var(--chrome-grad)' : 'transparent',
                    border: isCurrentReal && !sel
                      ? '1px solid var(--color-accent-primary)'
                      : '1px solid transparent',
                    color: sel ? '#1a1a1c' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                    fontWeight: sel ? 700 : 500,
                    padding: '6px 0',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-body)',
                    textTransform: 'lowercase',
                    transition: 'background var(--motion-fast) var(--ease-smooth), color var(--motion-fast) var(--ease-smooth)',
                  }}
                  onMouseEnter={e => {
                    if (!sel) e.currentTarget.style.background = 'var(--glass-bg-hover)'
                  }}
                  onMouseLeave={e => {
                    if (!sel) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {abbr}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function PickerOption({ label, sub, onClick, highlighted, primary }: {
  label: string
  sub?: string
  onClick: () => void
  highlighted?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: highlighted ? 'var(--glass-bg-elevated)' : 'transparent',
        border: highlighted ? '1px solid var(--color-border-chrome)' : '1px solid transparent',
        cursor: 'pointer',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        fontFamily: 'var(--font-body)',
        transition: 'background var(--motion-fast) var(--ease-smooth)',
      }}
      onMouseEnter={e => {
        if (!highlighted) e.currentTarget.style.background = 'var(--glass-bg-hover)'
      }}
      onMouseLeave={e => {
        if (!highlighted) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{
        fontSize: 'var(--text-sm)',
        fontWeight: primary ? 600 : 500,
        color: 'var(--color-text-primary)',
      }}>
        {label}
      </span>
      {sub && (
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'capitalize',
        }}>
          {sub}
        </span>
      )}
    </button>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-tertiary)', padding: 2,
  display: 'inline-flex', alignItems: 'center',
}

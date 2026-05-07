import { useState } from 'react'
import type { DayPeriods } from '../utils/dayPeriods'
import { DEFAULT_DAY_PERIODS, saveDayPeriods, minutesToHHMM, hhmmToMinutes } from '../utils/dayPeriods'
import {
  modalOverlay, modalShell, modalHeader, modalBody,
} from '../pages/finance/components/styleHelpers'

/**
 * Modal reached from the Dia view to shift the manhã/tarde/noite cutoffs.
 * Stores the result in localStorage via `saveDayPeriods`. Validates that
 * cutoffs are strictly increasing and night ends before midnight.
 */
export function DayPeriodsEditModal({ value, onClose, onSave }: {
  value: DayPeriods
  onClose: () => void
  onSave: (p: DayPeriods) => void
}) {
  const [morning, setMorning] = useState(minutesToHHMM(value.morningStart))
  const [afternoon, setAfternoon] = useState(minutesToHHMM(value.afternoonStart))
  const [evening, setEvening] = useState(minutesToHHMM(value.eveningStart))
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    const m = hhmmToMinutes(morning)
    const a = hhmmToMinutes(afternoon)
    const e = hhmmToMinutes(evening)
    if (m === null || a === null || e === null) {
      setError('Horário inválido')
      return
    }
    if (!(m < a && a < e && e < 1440)) {
      setError('Os horários devem ser crescentes e noite tem que terminar antes da meia-noite')
      return
    }
    const next: DayPeriods = { morningStart: m, afternoonStart: a, eveningStart: e }
    saveDayPeriods(next)
    onSave(next)
    onClose()
  }

  function handleReset() {
    setMorning(minutesToHHMM(DEFAULT_DAY_PERIODS.morningStart))
    setAfternoon(minutesToHHMM(DEFAULT_DAY_PERIODS.afternoonStart))
    setEvening(minutesToHHMM(DEFAULT_DAY_PERIODS.eveningStart))
    setError(null)
  }

  const field = (label: string, val: string, setVal: (v: string) => void) => (
    <div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9, color: 'var(--color-text-muted)',
        letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
        marginBottom: 6,
      }}>
        <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
        {label}
      </div>
      <input
        type="time"
        value={val}
        onChange={e => setVal(e.target.value)}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.55)'
          e.currentTarget.style.boxShadow = '0 0 12px rgba(143, 191, 211, 0.20)'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        style={{
          width: '100%',
          background: 'rgba(8, 12, 18, 0.55)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-ice-light)',
          fontFamily: 'var(--font-mono)',
          fontSize: 14, fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '8px 12px',
          borderRadius: 0,
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
          outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
          transition: 'border-color var(--motion-fast) var(--ease-smooth), box-shadow var(--motion-fast) var(--ease-smooth)',
        } as any}
      />
    </div>
  )

  // Estilos cyber compartilhados pros botões do footer
  const cyberBtnBase = {
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 10, fontWeight: 700,
    padding: '8px 16px',
    letterSpacing: '0.22em', textTransform: 'uppercase' as const,
    borderRadius: 0,
    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
    transition: 'all 0.15s',
  }

  return (
    <div onClick={onClose} style={{ ...modalOverlay(), zIndex: 1000 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ ...modalShell(), minWidth: 380 }}
      >
        {/* Hairline ice elétrica no topo (substitui modalHairline antigo) */}
        <div className="hq-hairline-ice" />
        <div style={modalHeader()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11, fontWeight: 700,
              color: 'var(--color-ice-light)',
              letterSpacing: '0.28em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <div
                aria-hidden="true"
                style={{
                  width: 8, height: 8,
                  background: 'var(--color-ice)',
                  boxShadow: '0 0 8px var(--color-ice-glow)',
                }}
              />
              <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
              PERIODS.CONFIG
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                width: 28, height: 28, borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
                transition: 'all var(--motion-fast) var(--ease-smooth)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.background = 'rgba(8, 12, 18, 0.55)'
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div style={{ ...modalBody(), display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 600,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.15em', textTransform: 'uppercase',
          lineHeight: 1.6,
        }}>
          Define onde cada período começa. A noite sempre termina à meia-noite (24:00).
        </div>

        {field('manhã começa às', morning, setMorning)}
        {field('tarde começa às', afternoon, setAfternoon)}
        {field('noite começa às', evening, setEvening)}

        {error && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 700,
            color: 'var(--color-accent-light)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '8px 12px',
            background: 'rgba(159, 18, 57, 0.08)',
            border: '1px solid rgba(159, 18, 57, 0.45)',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
          }}>
            <span style={{ color: 'var(--color-accent-primary)', opacity: 0.85, marginRight: 6, letterSpacing: 0 }}>//</span>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <button
            onClick={handleReset}
            style={{
              ...cyberBtnBase,
              background: 'rgba(8, 12, 18, 0.55)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-ice-light)'
              e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
              e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.background = 'rgba(8, 12, 18, 0.55)'
            }}
          >
            ↻ RESTAURAR
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                ...cyberBtnBase,
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-ice-light)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.background = 'rgba(8, 12, 18, 0.55)'
              }}
            >
              CANCELAR
            </button>
            <button
              onClick={handleSave}
              style={{
                ...cyberBtnBase,
                background: 'rgba(143, 191, 211, 0.14)',
                border: '1px solid var(--color-ice)',
                color: 'var(--color-ice-light)',
                boxShadow: '0 0 14px rgba(143, 191, 211, 0.30)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(143, 191, 211, 0.22)'
                e.currentTarget.style.boxShadow = '0 0 20px rgba(143, 191, 211, 0.50)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(143, 191, 211, 0.14)'
                e.currentTarget.style.boxShadow = '0 0 14px rgba(143, 191, 211, 0.30)'
              }}
            >
              ✓ SALVAR
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

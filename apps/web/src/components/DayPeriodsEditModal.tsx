import { useState } from 'react'
import type { DayPeriods } from '../utils/dayPeriods'
import { DEFAULT_DAY_PERIODS, saveDayPeriods, minutesToHHMM, hhmmToMinutes } from '../utils/dayPeriods'
import { Label } from './ui/Label'
import {
  modalOverlay, modalShell, modalHairline, modalHeader, modalBody,
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
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <input
        type="time"
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{
          width: '100%', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)', fontSize: 13, padding: '8px 10px', borderRadius: 3,
          outline: 'none', boxSizing: 'border-box', colorScheme: 'dark', fontFamily: 'monospace',
        } as any}
      />
    </div>
  )

  return (
    <div onClick={onClose} style={{ ...modalOverlay(), zIndex: 1000 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ ...modalShell(), minWidth: 380 }}
      >
        <div style={modalHairline} />
        <div style={modalHeader()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>períodos do dia</Label>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 14, padding: '2px 8px' }}>✕</button>
          </div>
        </div>
        <div style={{ ...modalBody(), display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Define onde cada período começa. A noite sempre termina à meia-noite (24:00).
        </div>

        {field('manhã começa às', morning, setMorning)}
        {field('tarde começa às', afternoon, setAfternoon)}
        {field('noite começa às', evening, setEvening)}

        {error && (
          <div style={{ fontSize: 11, color: 'var(--color-accent-light)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <button
            onClick={handleReset}
            style={{
              background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 10, padding: '8px 12px', borderRadius: 3,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            Restaurar padrão
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                color: 'var(--color-text-tertiary)', fontSize: 11, padding: '8px 14px', borderRadius: 3,
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              style={{
                background: 'var(--color-accent-primary)', color: 'var(--color-bg-primary)',
                border: 'none', cursor: 'pointer',
                fontSize: 11, padding: '8px 16px', borderRadius: 3, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}
            >
              Salvar
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

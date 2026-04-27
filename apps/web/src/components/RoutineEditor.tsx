import { useState } from 'react'
import type { Routine } from '../types'
import { PrioritySelect } from './PrioritySelect'
import { parseTimeToMinutes, minutesToHmm } from '../utils/datetime'

/**
 * Form for creating/editing a Routine. Title + recurrence (diária / dias úteis
 * / semanal / mensal) + day pickers + optional time window or estimated
 * duration. The parent owns `formData` state and decides when to save.
 */
export function RoutineEditor({
  routine,
  formData,
  setFormData,
  onSave,
  onDelete,
  onCancel
}: {
  routine: Routine | null
  formData: Partial<Routine>
  setFormData: (data: Partial<Routine>) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  const pythonDayToDom = (pd: number) => (pd + 1) % 7

  // Modo "horário fixo" vs "duração estimada" como state local (não derivado
  // do formData). Derivar causava trava: clicar "horário fixo" limpava
  // `estimated_minutes` mas não populava `start_time`, então o modo ficava
  // 'duration' no próximo render. Com state local, o toggle sempre funciona.
  const [mode, setMode] = useState<'fixed' | 'duration'>(() =>
    (formData.start_time || formData.end_time) ? 'fixed' : 'duration'
  )
  // Buffer local do input de duração — permite digitar "1:" antes de completar
  // sem perder o estado enquanto o parser não consegue extrair minutos.
  const [estimatedInput, setEstimatedInput] = useState<string>(
    formData.estimated_minutes ? minutesToHmm(formData.estimated_minutes) : ''
  )
  const switchMode = (m: 'fixed' | 'duration') => {
    if (m === 'fixed') {
      setFormData({ ...formData, estimated_minutes: null })
    } else {
      setFormData({ ...formData, start_time: null, end_time: null })
    }
    setMode(m)
  }

  const toggleDay = (pythonDay: number) => {
    const days = formData.days_of_week ? formData.days_of_week.split(',').map(Number) : []
    const idx = days.indexOf(pythonDay)
    if (idx > -1) {
      days.splice(idx, 1)
    } else {
      days.push(pythonDay)
    }
    setFormData({ ...formData, days_of_week: days.length > 0 ? days.join(',') : null })
  }

  const selectedDays = formData.days_of_week ? formData.days_of_week.split(',').map(Number) : []

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)', marginBottom: 12 }}>
      <input
        type="text"
        autoComplete="off"
        placeholder="Título da rotina"
        value={formData.title || ''}
        onChange={e => setFormData({ ...formData, title: e.target.value })}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(139, 46, 46, 0.2)'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        style={{
          width: '100%', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
          padding: '8px 10px', fontSize: 13, marginBottom: 12, borderRadius: 3, boxSizing: 'border-box',
          outline: 'none', fontFamily: "'Satoshi', sans-serif", fontWeight: 500,
          transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
        }}
      />

      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
          Prioridade
        </div>
        <PrioritySelect
          value={formData.priority || 'critical'}
          onChange={v => setFormData({ ...formData, priority: v })}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Recorrência
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['daily', 'weekdays', 'weekly', 'monthly'] as const).map(rec => (
            <button
              key={rec}
              onClick={() => setFormData({ ...formData, recurrence: rec, days_of_week: null, day_of_month: null })}
              style={{
                background: formData.recurrence === rec ? 'var(--color-accent-primary)' : 'transparent',
                border: `1px solid ${formData.recurrence === rec ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                color: formData.recurrence === rec ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer', padding: '6px 12px', fontSize: 11, borderRadius: 3,
                transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)', textTransform: 'capitalize',
                fontWeight: formData.recurrence === rec ? 600 : 500,
              }}
              onMouseEnter={e => {
                if (formData.recurrence !== rec) {
                  e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                  e.currentTarget.style.color = 'var(--color-accent-light)'
                }
              }}
              onMouseLeave={e => {
                if (formData.recurrence !== rec) {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              {rec === 'daily' ? 'Diária' : rec === 'weekdays' ? 'Dias úteis' : rec === 'weekly' ? 'Semanal' : 'Mensal'}
            </button>
          ))}
        </div>
      </div>

      {formData.recurrence === 'weekly' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Dias da semana
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: 7 }, (_, i) => i).map(pythonDay => (
              <button
                key={pythonDay}
                onClick={() => toggleDay(pythonDay)}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: selectedDays.includes(pythonDay) ? 'var(--color-accent-primary)' : 'transparent',
                  border: `1px solid ${selectedDays.includes(pythonDay) ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  color: selectedDays.includes(pythonDay) ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => {
                  if (!selectedDays.includes(pythonDay)) {
                    e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                    e.currentTarget.style.color = 'var(--color-accent-light)'
                  }
                }}
                onMouseLeave={e => {
                  if (!selectedDays.includes(pythonDay)) {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }
                }}
              >
                {dayLabels[pythonDayToDom(pythonDay)]}
              </button>
            ))}
          </div>
        </div>
      )}

      {formData.recurrence === 'monthly' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Dia do mês
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>Todo dia</span>
            <input
              type="number"
              autoComplete="off"
              min="1"
              max="31"
              placeholder="15"
              value={formData.day_of_month || ''}
              onChange={e => setFormData({ ...formData, day_of_month: e.target.value ? parseInt(e.target.value) : null })}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(139, 46, 46, 0.2)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                width: 50, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
                padding: '4px 6px', fontSize: 12, borderRadius: 3, outline: 'none',
                fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
                transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
              }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>do mês</span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Quando acontece
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([
            { key: 'fixed' as const, label: 'Horário fixo' },
            { key: 'duration' as const, label: 'Duração estimada' },
          ]).map(m => (
            <button
              key={m.key}
              onClick={() => switchMode(m.key)}
              style={{
                background: mode === m.key ? 'var(--color-accent-primary)' : 'transparent',
                border: `1px solid ${mode === m.key ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                color: mode === m.key ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer', padding: '6px 12px', fontSize: 11, borderRadius: 3,
                transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
                fontWeight: mode === m.key ? 600 : 500,
              }}
              onMouseEnter={e => {
                if (mode !== m.key) {
                  e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                  e.currentTarget.style.color = 'var(--color-accent-light)'
                }
              }}
              onMouseLeave={e => {
                if (mode !== m.key) {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'fixed' && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="time"
                    value={formData.start_time || ''}
                    onChange={e => setFormData({ ...formData, start_time: e.target.value || null })}
                    placeholder="Início"
                    onFocus={e => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(139, 46, 46, 0.2)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    style={{
                      flex: 1, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
                      padding: '6px 8px', fontSize: 12, borderRadius: 3, outline: 'none',
                      fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
                      transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
                    }}
                  />
                  <span style={{ color: 'var(--color-text-secondary)' }}>–</span>
                  <input
                    type="time"
                    value={formData.end_time || ''}
                    onChange={e => setFormData({ ...formData, end_time: e.target.value || null })}
                    placeholder="Fim"
                    onFocus={e => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(139, 46, 46, 0.2)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    style={{
                      flex: 1, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
                      padding: '6px 8px', fontSize: 12, borderRadius: 3, outline: 'none',
                      fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
                      transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
                    }}
                  />
                </div>
                {((formData.start_time && !formData.end_time) || (!formData.start_time && formData.end_time)) && (
                  <div style={{ fontSize: 10, color: 'var(--color-error)', marginTop: 4 }}>
                    ⚠ Preencha ambos os horários
                  </div>
                )}
              </>
            )}

            {mode === 'duration' && (
              <input
                type="text"
                autoComplete="off"
                placeholder="h:mm (ex: 1:30) ou minutos"
                title="Aceita '1:30' ou '90' (minutos)"
                value={estimatedInput}
                onChange={e => {
                  setEstimatedInput(e.target.value)
                  const parsed = parseTimeToMinutes(e.target.value)
                  setFormData({ ...formData, estimated_minutes: parsed ?? null })
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(139, 46, 46, 0.2)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                style={{
                  width: '100%', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)',
                  padding: '6px 8px', fontSize: 12, borderRadius: 3, outline: 'none', boxSizing: 'border-box',
                  fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
                  transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
                }}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onSave}
          style={{
            flex: 1, background: 'var(--color-accent-primary)', border: '1px solid var(--color-accent-primary)', color: 'var(--color-bg-primary)',
            cursor: 'pointer', padding: '10px 12px', fontSize: 12, borderRadius: 3,
            transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)', fontWeight: 600, letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--color-accent-secondary)'
            e.currentTarget.style.borderColor = 'var(--color-accent-secondary)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--color-accent-primary)'
            e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Salvar
        </button>
        {routine && (
          <button
            onClick={onDelete}
            style={{
              background: 'transparent', border: '1px solid var(--color-error)', color: 'var(--color-error)',
              cursor: 'pointer', padding: '10px 12px', fontSize: 12, borderRadius: 3,
              transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)', fontWeight: 500,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(139, 46, 46, 0.15)'
              e.currentTarget.style.borderColor = 'var(--color-accent-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--color-error)'
            }}
          >
            Excluir
          </button>
        )}
        <button
          onClick={onCancel}
          style={{
            background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
            cursor: 'pointer', padding: '10px 12px', fontSize: 12, borderRadius: 3,
            transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-text-primary)'
            e.currentTarget.style.borderColor = 'var(--color-accent-light)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-text-secondary)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

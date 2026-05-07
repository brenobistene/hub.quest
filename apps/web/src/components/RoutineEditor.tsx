import { useState } from 'react'
import { Repeat, Clock, Flag, Trash2, Check } from 'lucide-react'
import type { Routine } from '../types'
import { PrioritySelect } from './PrioritySelect'
import { CyberTimePicker } from './ui/CyberTimePicker'
import { parseTimeToMinutes, minutesToHmm } from '../utils/datetime'

/**
 * Form pra criar/editar Routine — cyberpunk CP2077.
 *
 * Layout: container chamferado ice + header `// NEW.ROUTINE` ou `// EDIT.ROUTINE`
 * + sections (Recorrência, Quando, Prioridade) com tab markers ice + footer
 * com ações cyber chamferadas. Pickers internos usam CyberTimePicker.
 */
export function RoutineEditor({
  routine,
  formData,
  setFormData,
  onSave,
  onDelete,
  onCancel,
}: {
  routine: Routine | null
  formData: Partial<Routine>
  setFormData: (data: Partial<Routine>) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const dayLabels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']
  const pythonDayToDom = (pd: number) => (pd + 1) % 7

  const [mode, setMode] = useState<'fixed' | 'duration'>(() =>
    (formData.start_time || formData.end_time) ? 'fixed' : 'duration'
  )
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
    if (idx > -1) days.splice(idx, 1)
    else days.push(pythonDay)
    setFormData({ ...formData, days_of_week: days.length > 0 ? days.join(',') : null })
  }

  const selectedDays = formData.days_of_week ? formData.days_of_week.split(',').map(Number) : []
  const recurrence = formData.recurrence ?? 'daily'
  const titleEmpty = !(formData.title ?? '').trim()
  const timeMismatch = (formData.start_time && !formData.end_time) || (!formData.start_time && formData.end_time)

  const RECURRENCES: { key: NonNullable<Routine['recurrence']>; label: string }[] = [
    { key: 'daily',    label: 'DIÁRIA' },
    { key: 'weekdays', label: 'DIAS ÚTEIS' },
    { key: 'weekly',   label: 'SEMANAL' },
    { key: 'monthly',  label: 'MENSAL' },
  ]

  return (
    <div
      className="hq-animate-fade-up"
      style={{
        background: 'rgba(8, 12, 18, 0.55)',
        border: '1px solid var(--color-ice-deep)',
        borderRadius: 0,
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)',
        overflow: 'hidden',
        boxShadow: '0 0 24px rgba(143, 191, 211, 0.12), 0 8px 28px rgba(0, 0, 0, 0.55)',
        marginBottom: 'var(--space-4)',
      }}
    >
      {/* Hairline ice elétrica */}
      <div className="hq-hairline-ice" />

      {/* Header: tab marker + // EDIT.ROUTINE / // NEW.ROUTINE + título input */}
      <div
        style={{
          padding: '14px 18px 12px',
          background: `radial-gradient(ellipse 100% 80% at 0% 0%, rgba(143, 191, 211, 0.05), transparent 60%)`,
          borderBottom: '1px solid var(--color-ice-deep)',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 700,
          color: 'var(--color-ice-light)',
          letterSpacing: '0.25em', textTransform: 'uppercase',
          marginBottom: 8, lineHeight: 1,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div
            aria-hidden="true"
            style={{
              width: 3, height: 12,
              background: 'var(--color-ice)',
              boxShadow: '0 0 6px var(--color-ice-glow)',
            }}
          />
          <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
          {routine ? 'EDIT.ROUTINE' : 'NEW.ROUTINE'}
        </div>

        <input
          type="text"
          autoComplete="off"
          autoFocus
          aria-label="Título da rotina"
          placeholder="Nome da rotina…"
          value={formData.title || ''}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--color-ice)' }}
          onBlur={e => { e.currentTarget.style.borderBottomColor = 'var(--color-ice-deep)' }}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--color-ice-deep)',
            color: 'var(--color-ice-light)',
            padding: '4px 0 6px',
            fontSize: 16, fontWeight: 600,
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            boxSizing: 'border-box',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
        />
      </div>

      {/* Body */}
      <div style={{
        padding: '14px 18px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>

        {/* ─── Recorrência ─── */}
        <Section icon={<Repeat size={11} strokeWidth={2} />} label="RECURRENCE">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {RECURRENCES.map(rec => {
              const active = recurrence === rec.key
              return (
                <button
                  key={rec.key}
                  onClick={() => setFormData({ ...formData, recurrence: rec.key, days_of_week: null, day_of_month: null })}
                  style={{
                    background: active ? 'rgba(143, 191, 211, 0.14)' : 'rgba(8, 12, 18, 0.55)',
                    border: `1px solid ${active ? 'var(--color-ice)' : 'var(--color-border)'}`,
                    color: active ? 'var(--color-ice-light)' : 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    padding: '5px 11px',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.22em', textTransform: 'uppercase',
                    borderRadius: 0,
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                    boxShadow: active ? '0 0 10px rgba(143, 191, 211, 0.25)' : 'none',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (active) return
                    e.currentTarget.style.color = 'var(--color-ice-light)'
                    e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                  }}
                  onMouseLeave={e => {
                    if (active) return
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                  }}
                >
                  {rec.label}
                </button>
              )
            })}
          </div>

          {recurrence === 'weekly' && (
            <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Array.from({ length: 7 }, (_, i) => i).map(pythonDay => {
                const sel = selectedDays.includes(pythonDay)
                return (
                  <button
                    key={pythonDay}
                    onClick={() => toggleDay(pythonDay)}
                    aria-pressed={sel}
                    style={{
                      minWidth: 38, height: 28,
                      padding: '0 6px',
                      background: sel ? 'rgba(143, 191, 211, 0.14)' : 'rgba(8, 12, 18, 0.55)',
                      border: `1px solid ${sel ? 'var(--color-ice)' : 'var(--color-border)'}`,
                      color: sel ? 'var(--color-ice-light)' : 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.18em',
                      borderRadius: 0,
                      clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: sel ? '0 0 8px rgba(143, 191, 211, 0.25)' : 'none',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (sel) return
                      e.currentTarget.style.color = 'var(--color-ice-light)'
                      e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                    }}
                    onMouseLeave={e => {
                      if (sel) return
                      e.currentTarget.style.color = 'var(--color-text-tertiary)'
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                    }}
                  >
                    {dayLabels[pythonDayToDom(pythonDay)]}
                  </button>
                )
              })}
            </div>
          )}

          {recurrence === 'monthly' && (
            <div style={{
              marginTop: 10,
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 10, fontWeight: 700,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>
              <span>TODO DIA</span>
              <input
                type="number"
                autoComplete="off"
                min="1" max="31"
                placeholder="15"
                aria-label="Dia do mês"
                value={formData.day_of_month || ''}
                onChange={e => setFormData({ ...formData, day_of_month: e.target.value ? parseInt(e.target.value) : null })}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'var(--color-ice)'
                  e.currentTarget.style.boxShadow = '0 0 8px rgba(143, 191, 211, 0.30)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                style={{
                  width: 50, height: 28,
                  background: 'rgba(8, 12, 18, 0.55)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ice-light)',
                  padding: '0 6px',
                  fontSize: 11,
                  outline: 'none',
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  borderRadius: 0,
                  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
                  transition: 'all 0.15s',
                }}
              />
              <span>DO MÊS</span>
            </div>
          )}
        </Section>

        {/* ─── Quando ─── */}
        <Section icon={<Clock size={11} strokeWidth={2} />} label="WHEN">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {([
              { key: 'fixed' as const,    label: 'HORÁRIO' },
              { key: 'duration' as const, label: 'DURAÇÃO' },
            ]).map(m => {
              const active = mode === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => switchMode(m.key)}
                  style={{
                    background: active ? 'rgba(143, 191, 211, 0.14)' : 'rgba(8, 12, 18, 0.55)',
                    border: `1px solid ${active ? 'var(--color-ice)' : 'var(--color-border)'}`,
                    color: active ? 'var(--color-ice-light)' : 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    padding: '5px 11px',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.22em', textTransform: 'uppercase',
                    borderRadius: 0,
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                    boxShadow: active ? '0 0 10px rgba(143, 191, 211, 0.25)' : 'none',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (active) return
                    e.currentTarget.style.color = 'var(--color-ice-light)'
                    e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                  }}
                  onMouseLeave={e => {
                    if (active) return
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          {mode === 'fixed' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <CyberTimePicker
                  value={formData.start_time || ''}
                  onChange={v => setFormData({ ...formData, start_time: v || null })}
                  width={110}
                />
                <span style={{ color: 'var(--color-ice)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>→</span>
                <CyberTimePicker
                  value={formData.end_time || ''}
                  onChange={v => setFormData({ ...formData, end_time: v || null })}
                  width={110}
                />
              </div>
              {timeMismatch && (
                <div role="alert" style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, fontWeight: 700,
                  color: 'var(--color-accent-light)',
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  marginTop: 6,
                }}>
                  <span style={{ color: 'var(--color-accent-primary)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
                  PREENCHA INÍCIO E FIM
                </div>
              )}
            </div>
          )}

          {mode === 'duration' && (
            <input
              type="text"
              autoComplete="off"
              placeholder="ex: 1:30 ou 90"
              aria-label="Duração estimada"
              title="Aceita '1:30' ou minutos puros como '90'"
              value={estimatedInput}
              onChange={e => {
                setEstimatedInput(e.target.value)
                const parsed = parseTimeToMinutes(e.target.value)
                setFormData({ ...formData, estimated_minutes: parsed ?? null })
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--color-ice)'
                e.currentTarget.style.boxShadow = '0 0 10px rgba(143, 191, 211, 0.30)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                width: 160, height: 28, marginTop: 10,
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-ice-light)',
                padding: '0 10px',
                fontSize: 11, fontWeight: 700,
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em',
                fontVariantNumeric: 'tabular-nums',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
                transition: 'all 0.15s',
              }}
            />
          )}
        </Section>

        {/* ─── Prioridade ─── */}
        <Section icon={<Flag size={11} strokeWidth={2} />} label="PRIORITY">
          <PrioritySelect
            value={formData.priority || 'critical'}
            onChange={v => setFormData({ ...formData, priority: v })}
          />
        </Section>
      </div>

      {/* Footer com ações cyber */}
      <div style={{
        borderTop: '1px solid var(--color-ice-deep)',
        padding: '12px 18px',
        background: 'rgba(0, 0, 0, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        {routine ? (
          <button
            onClick={onDelete}
            aria-label="Excluir rotina"
            style={{
              background: 'rgba(8, 12, 18, 0.55)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              padding: '6px 12px',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              borderRadius: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-accent-light)'
              e.currentTarget.style.borderColor = 'rgba(159, 18, 57, 0.45)'
              e.currentTarget.style.background = 'rgba(159, 18, 57, 0.10)'
              e.currentTarget.style.boxShadow = '0 0 10px rgba(159, 18, 57, 0.20)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.background = 'rgba(8, 12, 18, 0.55)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <Trash2 size={10} strokeWidth={1.8} />
            EXCLUIR
          </button>
        ) : <div />}

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(8, 12, 18, 0.55)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              padding: '6px 14px',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              borderRadius: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-text-secondary)'
              e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.35)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            CANCELAR
          </button>
          <button
            onClick={onSave}
            disabled={titleEmpty}
            aria-disabled={titleEmpty}
            title={titleEmpty ? 'Dê um título antes de salvar' : undefined}
            style={{
              background: titleEmpty ? 'rgba(8, 12, 18, 0.55)' : 'rgba(143, 191, 211, 0.14)',
              border: `1px solid ${titleEmpty ? 'var(--color-border)' : 'var(--color-ice)'}`,
              color: titleEmpty ? 'var(--color-text-muted)' : 'var(--color-ice-light)',
              cursor: titleEmpty ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)',
              padding: '6px 16px',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.22em', textTransform: 'uppercase',
              borderRadius: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              boxShadow: titleEmpty ? 'none' : '0 0 12px rgba(143, 191, 211, 0.25)',
              transition: 'all 0.15s',
              opacity: titleEmpty ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (titleEmpty) return
              e.currentTarget.style.background = 'rgba(143, 191, 211, 0.22)'
              e.currentTarget.style.boxShadow = '0 0 18px rgba(143, 191, 211, 0.40)'
            }}
            onMouseLeave={e => {
              if (titleEmpty) return
              e.currentTarget.style.background = 'rgba(143, 191, 211, 0.14)'
              e.currentTarget.style.boxShadow = '0 0 12px rgba(143, 191, 211, 0.25)'
            }}
          >
            <Check size={10} strokeWidth={2.2} />
            ✓ SALVAR
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Internal ────────────────────────────────────────────────────────────

function Section({ icon, label, children }: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <div
          aria-hidden="true"
          style={{
            width: 3, height: 12,
            background: 'var(--color-ice)',
            boxShadow: '0 0 6px var(--color-ice-glow)',
            flexShrink: 0,
          }}
        />
        <span style={{ color: 'var(--color-ice-light)', display: 'inline-flex', flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, fontWeight: 700,
          color: 'var(--color-ice-light)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>
          <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

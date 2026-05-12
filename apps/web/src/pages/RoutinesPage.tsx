import { useState } from 'react'
import type { Routine } from '../types'
import { createRoutine, updateRoutine, deleteRoutine, reportApiError } from '../api'
import { useRoutines, useAppInvalidator } from '../lib/app-queries'
import { tabSync } from '../lib/tabsync'
import { RoutineEditor } from '../components/RoutineEditor'
import { PageShell, TechId } from '../components/ui/CyberShell'
import { alertDialog, confirmDialog } from '../lib/dialog'
import { Pencil } from 'lucide-react'

/**
 * `/rotinas` — gerenciador de rotinas. Agrupa por recorrência
 * (diárias & dias úteis / semanais / mensais). Clique em "+ nova rotina" ou
 * no ✎ de uma rotina abre o `RoutineEditor` inline.
 */
export function RoutinesView() {
  // Routines via React Query — substituiu useState + fetchAllRoutines manual.
  const routinesQ = useRoutines()
  const routines: Routine[] = routinesQ.data ?? []
  const loading = routinesQ.isPending
  const appInv = useAppInvalidator()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Routine>>({
    title: '',
    recurrence: 'daily',
    days_of_week: null,
    day_of_month: null,
    start_time: null,
    end_time: null,
    estimated_minutes: null,
    priority: 'critical',
  })

  const handleNewRoutine = () => {
    setEditingId('new')
    setFormData({
      title: '',
      recurrence: 'daily',
      days_of_week: null,
      day_of_month: null,
      start_time: null,
      end_time: null,
      estimated_minutes: null,
      priority: 'critical',
    })
  }

  const handleEditRoutine = (routine: Routine) => {
    setEditingId(routine.id)
    setFormData(routine)
  }

  const handleSave = async () => {
    if (!formData.title) return

    if ((formData.start_time && !formData.end_time) || (!formData.start_time && formData.end_time)) {
      alertDialog({ title: 'Horários incompletos', message: 'Preencha ambos os horários ou deixe em branco.', variant: 'warning' })
      return
    }

    if (!formData.start_time && !formData.end_time && !formData.estimated_minutes) {
      alertDialog({ title: 'Tempo obrigatório', message: 'Preencha a duração estimada ou o horário da rotina.', variant: 'warning' })
      return
    }

    try {
      if (editingId === 'new') {
        await createRoutine(formData as any)
      } else {
        await updateRoutine(editingId!, formData)
      }
      appInv.routines(); tabSync.emit('routines')
      setEditingId(null)
    } catch (err) {
      reportApiError('RoutinesPage.save', err)
      alertDialog({ title: 'Erro', message: 'Erro ao salvar rotina. Veja o console para detalhes.', variant: 'danger' })
    }
  }

  const handleDelete = async () => {
    if (!editingId || editingId === 'new') return
    try {
      await deleteRoutine(editingId)
      appInv.routines(); tabSync.emit('routines')
      setEditingId(null)
    } catch (err) {
      reportApiError('RoutinesPage.delete', err)
      alertDialog({ title: 'Erro', message: 'Erro ao excluir rotina.', variant: 'danger' })
    }
  }

  const getRecurrenceLabel = (r: Routine) => {
    if (r.recurrence === 'daily') return 'TODO DIA'
    if (r.recurrence === 'weekdays') return 'DIAS ÚTEIS'
    if (r.recurrence === 'weekly' && r.days_of_week) {
      const dayLabels = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']
      const days = r.days_of_week.split(',').map(d => dayLabels[parseInt(d)])
      return days.join(' · ')
    }
    if (r.recurrence === 'monthly' && r.day_of_month) {
      return `TODO DIA ${r.day_of_month}`
    }
    return ''
  }

  // Cores semânticas pro dot de prioridade.
  const PRIORITY_META: Record<string, { color: string; label: string }> = {
    critical: { color: 'var(--color-accent-primary)', label: 'CRÍTICA' },
    high:     { color: 'var(--color-warning)',         label: 'ALTA' },
    medium:   { color: 'var(--color-accent-light)',    label: 'MÉDIA' },
    low:      { color: 'var(--color-text-tertiary)',   label: 'BAIXA' },
  }

  if (loading && routines.length === 0) {
    return (
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10, fontWeight: 700,
        color: 'var(--color-text-muted)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
        padding: 'var(--space-6)',
      }}>
        <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
        CARREGANDO ROTINAS…
      </div>
    )
  }

  const totalDaily = routines.filter(r => r.recurrence === 'daily' || r.recurrence === 'weekdays').length
  const totalWeekly = routines.filter(r => r.recurrence === 'weekly').length
  const totalMonthly = routines.filter(r => r.recurrence === 'monthly').length

  return (
    <PageShell
      headerLabel="ROTINAS"
      headerLeftContent={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14, fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
            lineHeight: 1.1,
          }}>
            {routines.length} {routines.length === 1 ? 'ROTINA' : 'ROTINAS'}
          </span>
          <TechId>
            {totalDaily} DIA · {totalWeekly} WEEK · {totalMonthly} MONTH
          </TechId>
        </div>
      }
      headerRightControls={
        <button
          onClick={handleNewRoutine}
          style={{
            background: 'rgba(143, 191, 211, 0.10)',
            border: '1px solid rgba(143, 191, 211, 0.45)',
            cursor: 'pointer',
            color: 'var(--color-ice-light)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 700,
            padding: '7px 14px',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            borderRadius: 0,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
            boxShadow: '0 0 12px rgba(143, 191, 211, 0.18)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(143, 191, 211, 0.18)'
            e.currentTarget.style.boxShadow = '0 0 18px rgba(143, 191, 211, 0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
            e.currentTarget.style.boxShadow = '0 0 12px rgba(143, 191, 211, 0.18)'
          }}
        >
          + NOVA ROTINA
        </button>
      }
      footerCaption={
        <>
          <div>// HABITS.SCHEDULER · {routines.length} REGISTERED</div>
          <div style={{ opacity: 0.6, marginTop: 2 }}>TYPE: TACTICAL.ROUTINES</div>
        </>
      }
    >

      {editingId === 'new' && (
        <div style={{ marginTop: 32 }}>
          <RoutineEditor
            routine={null}
            formData={formData}
            setFormData={setFormData}
            onSave={handleSave}
            onDelete={() => {}}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {routines.length === 0 && editingId === null ? (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 700,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '14px 16px',
            border: '1px dashed rgba(143, 191, 211, 0.30)',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
          }}>
            <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
            NENHUMA ROTINA REGISTRADA · CRIE UMA NO + NOVA ROTINA
          </div>
        ) : (
          (() => {
            const daily = routines.filter(r => r.recurrence === 'daily' || r.recurrence === 'weekdays')
            const weekly = routines.filter(r => r.recurrence === 'weekly')
            const monthly = routines.filter(r => r.recurrence === 'monthly')

            async function handleInlineDelete(r: Routine) {
              const ok = await confirmDialog({
                title: 'Excluir rotina',
                message: `Excluir a rotina "${r.title}"?`,
                confirmLabel: 'EXCLUIR',
                danger: true,
              })
              if (!ok) return
              deleteRoutine(r.id).then(() => {
                appInv.routines(); tabSync.emit('routines')
              }).catch(() => alertDialog({ title: 'Erro', message: 'Erro ao excluir rotina', variant: 'danger' }))
            }

            const renderGroup = (title: string, items: Routine[]) => {
              if (items.length === 0 && editingId !== 'new') return null
              return (
                <section key={title} style={{ marginBottom: 32 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10, fontWeight: 700,
                    color: 'var(--color-ice-light)',
                    letterSpacing: '0.25em', textTransform: 'uppercase',
                    marginBottom: 14,
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--color-ice-deep)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div
                      aria-hidden="true"
                      style={{
                        width: 3, height: 14,
                        background: 'var(--color-ice)',
                        boxShadow: '0 0 8px var(--color-ice-glow)',
                      }}
                    />
                    <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
                    {title}
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>
                      [{items.length.toString().padStart(2, '0')}]
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(r => {
                      const isEditing = editingId === r.id
                      const priority = (r as any).priority || 'critical'
                      const meta = PRIORITY_META[priority] ?? PRIORITY_META.critical
                      if (isEditing) {
                        return (
                          <RoutineEditor
                            key={r.id}
                            routine={r}
                            formData={formData}
                            setFormData={setFormData}
                            onSave={handleSave}
                            onDelete={handleDelete}
                            onCancel={() => setEditingId(null)}
                          />
                        )
                      }
                      return (
                        <div
                          key={r.id}
                          style={{
                            position: 'relative',
                            padding: '12px 14px',
                            background: 'rgba(8, 12, 18, 0.55)',
                            border: '1px solid rgba(143, 191, 211, 0.18)',
                            borderLeft: `2px solid ${meta.color}`,
                            borderRadius: 0,
                            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
                            display: 'flex', alignItems: 'center', gap: 12,
                            opacity: r.done ? 0.7 : 1,
                            transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
                          }}
                          onMouseEnter={e => {
                            if (r.done) return
                            e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.40)'
                            e.currentTarget.style.boxShadow = `0 0 12px ${meta.color}33`
                            e.currentTarget.style.transform = 'translateX(2px)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.18)'
                            e.currentTarget.style.boxShadow = 'none'
                            e.currentTarget.style.transform = 'translateX(0)'
                          }}
                        >
                          {/* Square dot priority */}
                          <span
                            title={`Prioridade: ${meta.label}`}
                            style={{
                              width: 8, height: 8,
                              background: meta.color,
                              flexShrink: 0,
                              boxShadow: `0 0 6px ${meta.color}`,
                            }}
                          />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              color: r.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                              fontFamily: 'var(--font-display)',
                              fontWeight: 600, fontSize: 14,
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase',
                              textDecoration: r.done ? 'line-through' : 'none',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {r.title}
                            </div>
                            <div style={{
                              marginTop: 6,
                              display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9, fontWeight: 700,
                              letterSpacing: '0.18em', textTransform: 'uppercase',
                            }}>
                              <span style={{ color: 'var(--color-text-tertiary)' }}>
                                <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
                                {getRecurrenceLabel(r)}
                              </span>
                              {r.start_time && r.end_time && (
                                <span style={{ color: 'var(--color-text-tertiary)' }}>
                                  <span style={{ color: 'var(--color-text-muted)', marginRight: 4 }}>T</span>
                                  {r.start_time} → {r.end_time}
                                </span>
                              )}
                              {r.estimated_minutes != null && r.estimated_minutes > 0 && (
                                <span style={{ color: 'var(--color-text-tertiary)' }}>
                                  <span style={{ color: 'var(--color-text-muted)', marginRight: 4 }}>EST</span>
                                  {r.estimated_minutes}MIN
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Edit button */}
                          <button
                            onClick={e => { e.stopPropagation(); handleEditRoutine(r) }}
                            title="Editar rotina"
                            style={iconBtnStyle}
                            onMouseEnter={e => {
                              e.currentTarget.style.color = 'var(--color-ice-light)'
                              e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
                              e.currentTarget.style.background = 'rgba(143, 191, 211, 0.10)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = 'var(--color-text-tertiary)'
                              e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.18)'
                              e.currentTarget.style.background = 'rgba(143, 191, 211, 0.04)'
                            }}
                          >
                            <Pencil size={11} strokeWidth={1.8} />
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={e => { e.stopPropagation(); handleInlineDelete(r) }}
                            title="Excluir rotina"
                            style={iconBtnStyle}
                            onMouseEnter={e => {
                              e.currentTarget.style.color = 'var(--color-accent-light)'
                              e.currentTarget.style.borderColor = 'rgba(159, 18, 57, 0.45)'
                              e.currentTarget.style.background = 'rgba(159, 18, 57, 0.10)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = 'var(--color-text-tertiary)'
                              e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.18)'
                              e.currentTarget.style.background = 'rgba(143, 191, 211, 0.04)'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            }

            return (
              <>
                {renderGroup('DIÁRIAS & DIAS ÚTEIS', daily)}
                {renderGroup('SEMANAIS', weekly)}
                {renderGroup('MENSAIS', monthly)}
              </>
            )
          })()
        )}
      </div>
    </PageShell>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'rgba(143, 191, 211, 0.04)',
  border: '1px solid rgba(143, 191, 211, 0.18)',
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  padding: '5px 8px',
  fontSize: 12,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 0,
  clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%)',
  flexShrink: 0,
  transition: 'all 0.15s',
}

import { useEffect, useRef, useState } from 'react'
import type { Area, Deliverable, Project, Quest } from '../types'
import { createDeliverable, updateDeliverable, deleteDeliverable } from '../api'
import { getAreaColor } from '../utils/quests'
import { InlineText } from './ui/InlineText'
import { StartPauseButton } from './StartPauseButton'

/**
 * Row usado na QuestsView. Mostra quest subtarefa com título inline-editável,
 * breadcrumb de projeto + entregável, StartPauseButton cluster.
 *
 * Quests sempre têm project_id + deliverable_id após a refatoração — não há
 * mais quest-projeto. Se precisar renderizar um projeto, use AreaProjectRow
 * (em AreasPage) ou QuestDetailPanel.
 */
export function QuestRow({ q, onUpdate, onClick, isSelected, projects = [], areas = [], onSessionUpdate, hideTimer, onDelete, deliverables = [], sessionUpdateTrigger = 0 }: { q: Quest; onUpdate: (id: string, patch: Partial<Quest>) => void; onClick?: () => void; isSelected?: boolean; projects?: Project[]; areas?: Area[]; onSessionUpdate?: () => void; hideTimer?: boolean; onDelete?: (id: string) => void; deliverables?: Deliverable[]; sessionUpdateTrigger?: number }) {
  const parentProject = q.project_id ? projects.find(p => p.id === q.project_id) : null
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [showDeliverables, setShowDeliverables] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [newDeliverableTitle, setNewDeliverableTitle] = useState('')
  const [deliverablesList, setDeliverablesList] = useState(deliverables)
  const editorRef = useRef<HTMLDivElement>(null)

  // Sync local state only when the prop's content actually changed. The
  // prop often arrives as a fresh `[]` reference per render (callers build
  // the array inline in their map), so a naive `setState(deliverables)`
  // loops forever even when nothing meaningful changed.
  useEffect(() => {
    setDeliverablesList(prev => {
      if (prev === deliverables) return prev
      if (prev.length !== deliverables.length) return deliverables
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i]
        const b = deliverables[i]
        if (a.id !== b.id || a.done !== b.done || a.title !== b.title) return deliverables
      }
      return prev
    })
  }, [deliverables])

  useEffect(() => {
    if (!isEditingProject) return
    const handleClickOutside = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setIsEditingProject(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditingProject])

  const handleAddDeliverable = async () => {
    const t = newDeliverableTitle.trim()
    if (!t) return
    try {
      const created = await createDeliverable(q.id, t)
      setDeliverablesList([...deliverablesList, created])
      setNewDeliverableTitle('')
    } catch (e) {
      console.error('Failed to create deliverable:', e)
    }
  }

  const handleToggleDeliverable = async (delivId: string) => {
    try {
      const deliv = deliverablesList.find(d => d.id === delivId)
      if (!deliv) return
      const updated = await updateDeliverable(delivId, { done: !deliv.done })
      setDeliverablesList(deliverablesList.map(d => d.id === delivId ? updated : d))
    } catch (e) {
      console.error('Failed to update deliverable:', e)
    }
  }

  const handleDeleteDeliverable = async (delivId: string) => {
    try {
      await deleteDeliverable(delivId)
      setDeliverablesList(deliverablesList.filter(d => d.id !== delivId))
    } catch (e) {
      console.error('Failed to delete deliverable:', e)
    }
  }

  const deliverablesDone = deliverablesList.filter(d => d.done).length
  const deliverablePercent = deliverablesList.length > 0 ? Math.round((deliverablesDone / deliverablesList.length) * 100) : 0

  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px var(--space-3)',
        borderBottom: '1px solid var(--color-divider)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        cursor: onClick ? 'pointer' : 'auto',
        background: isSelected ? 'var(--glass-bg-hover)' : 'transparent',
        borderRadius: 'var(--radius-sm)',
        transition: 'background var(--motion-fast) var(--ease-smooth)',
      }}
      onMouseEnter={e => { if (onClick && !isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg-hover)' }}
      onMouseLeave={e => { if (onClick && !isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
        background: getAreaColor(q.area_slug, areas),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <InlineText
                value={q.title}
                onSave={v => onUpdate(q.id, { title: v })}
                style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500 }}
              />
              {q.description && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDescription(!showDescription)
                  }}
                  title={showDescription ? 'Ocultar descrição' : 'Mostrar descrição'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', fontSize: 10, padding: '2px 4px',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  <span style={{ fontSize: 9 }}>{showDescription ? '▼' : '▶'}</span>
                  <span style={{ fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase' }}>info</span>
                </button>
              )}
            </div>
            {showDescription && q.description && (
              <div style={{
                marginTop: 8, padding: '8px 10px', background: 'var(--color-bg-tertiary)',
                borderLeft: '2px solid var(--color-accent-light)', borderRadius: 2,
                fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4,
              }}>
                <InlineText
                  value={q.description}
                  onSave={v => onUpdate(q.id, { description: v || null })}
                  style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}
                />
              </div>
            )}
            {parentProject && (
              <div ref={editorRef} style={{ marginTop: 6, fontSize: 10 }}>
                {!isEditingProject ? (
                  <div
                    onClick={e => {
                      e.stopPropagation()
                      setIsEditingProject(true)
                    }}
                    style={{
                      color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '2px 4px',
                      borderRadius: 2, transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = '#7a6f68'
                      e.currentTarget.style.background = '#1a1a1a'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span>{parentProject.title}</span>
                    {q.deliverable_id && (() => {
                      const d = deliverables.find(x => x.id === q.deliverable_id)
                      if (!d) return null
                      return (
                        <>
                          <span style={{ color: 'var(--color-text-muted)' }}>›</span>
                          <span style={{ color: 'var(--color-accent-light)' }}>{d.title}</span>
                        </>
                      )
                    })()}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={q.area_slug}
                      onChange={e => onUpdate(q.id, { area_slug: e.target.value })}
                      style={{
                        background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                        fontSize: 10, padding: '2px 4px', borderRadius: 2, outline: 'none',
                        cursor: 'pointer', transition: 'border 0.15s',
                      }}
                      onClick={e => e.stopPropagation()}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent-light)')}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                        setIsEditingProject(false)
                      }}
                    >
                      {areas.map(a => (
                        <option key={a.slug} value={a.slug}>
                          {a.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={q.project_id || ''}
                      onChange={e => onUpdate(q.id, { project_id: e.target.value || null })}
                      style={{
                        background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                        fontSize: 10, padding: '2px 4px', borderRadius: 2, outline: 'none',
                        cursor: 'pointer', transition: 'border 0.15s',
                      }}
                      onClick={e => e.stopPropagation()}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent-light)')}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                        setIsEditingProject(false)
                      }}
                    >
                      <option value="">Sem projeto</option>
                      {projects
                        .filter(proj => proj.area_slug === q.area_slug)
                        .map(proj => (
                          <option key={proj.id} value={proj.id}>
                            {proj.title}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {!hideTimer && <StartPauseButton questId={q.id} onUpdate={onUpdate} onSessionChange={onSessionUpdate} status={q.status} onDelete={onDelete} isSubtask={true} deliverables={deliverables as any} linkedDeliverableId={q.deliverable_id} sessionUpdateTrigger={sessionUpdateTrigger} />}
            {false && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete && onDelete(q.id)
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-accent-light)', fontSize: 11, padding: '2px 4px',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--color-accent-vivid)'
                  e.currentTarget.style.opacity = '0.8'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--color-accent-light)'
                  e.currentTarget.style.opacity = '1'
                }}
                title="Excluir projeto"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
        <InlineText
          value={q.next_action ?? ''}
          onSave={v => onUpdate(q.id, { next_action: v })}
          style={{ marginTop: 5, fontSize: 12, color: 'var(--color-text-tertiary)', display: 'block' }}
        />

        {false && deliverablesList.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowDeliverables(!showDeliverables)
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-secondary)', fontSize: 11, letterSpacing: '0.08em',
                textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
                padding: '2px 0', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-accent-light)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              title={`${deliverablesDone}/${deliverablesList.length} entregas concluídas`}
            >
              <span style={{ fontSize: 10 }}>{showDeliverables ? '▼' : '▶'}</span>
              <span>Entregas ({deliverablesDone}/{deliverablesList.length})</span>
            </button>

            <div style={{
              marginTop: 8, height: 4, background: 'var(--color-bg-tertiary)', borderRadius: 2,
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%', background: 'var(--color-success)',
                width: `${deliverablePercent}%`, transition: 'width 0.3s cubic-bezier(0.3, 0, 0.7, 1)',
              }} />
            </div>

            {showDeliverables && (
              <div style={{ marginTop: 10, paddingLeft: 4 }}>
                {deliverablesList.map(deliv => (
                  <div key={deliv.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    padding: '4px 0', borderBottom: '1px solid var(--color-divider)',
                  }}>
                    <input
                      type="checkbox"
                      checked={deliv.done}
                      onChange={() => handleToggleDeliverable(deliv.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        cursor: 'pointer', width: 14, height: 14, flexShrink: 0,
                        accentColor: 'var(--color-success)',
                      }}
                    />
                    <span style={{
                      flex: 1, fontSize: 11, color: deliv.done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                      textDecoration: deliv.done ? 'line-through' : 'none',
                      opacity: deliv.done ? 0.6 : 1, transition: 'all 0.15s',
                    }}>
                      {deliv.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDeliverable(deliv.id)
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-muted)', fontSize: 10, padding: '0 2px',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-accent-light)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
                      title="Deletar entrega"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    autoComplete="off"
                    value={newDeliverableTitle}
                    onChange={(e) => {
                      e.stopPropagation()
                      setNewDeliverableTitle(e.target.value)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') {
                        handleAddDeliverable()
                      }
                      if (e.key === 'Escape') {
                        setNewDeliverableTitle('')
                      }
                    }}
                    placeholder="nova entrega…"
                    style={{
                      flex: 1, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
                      borderRadius: 3, color: 'var(--color-text-secondary)', fontSize: 11,
                      padding: '4px 6px', outline: 'none', transition: 'all 0.15s',
                      fontFamily: "'Satoshi', sans-serif",
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border)'
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddDeliverable()
                    }}
                    style={{
                      background: 'var(--color-accent-primary)', border: 'none', cursor: 'pointer',
                      color: 'var(--color-bg-primary)', fontSize: 10, padding: '4px 8px',
                      borderRadius: 3, fontWeight: 600, letterSpacing: '0.05em',
                      transition: 'all 0.15s cubic-bezier(0.3, 0, 0.7, 1)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.opacity = '0.9'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.opacity = '1'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                    disabled={!newDeliverableTitle.trim()}
                    title="Adicionar entrega"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

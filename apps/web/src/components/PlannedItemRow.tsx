import { useEffect, useState } from 'react'
import type { ActiveSession, Area, Quest } from '../types'
import {
  fetchSessions, fetchTaskSessions, fetchRoutineSessions,
  patchQuest, updateTask, updateRoutine, toggleRoutine,
  reportApiError,
} from '../api'
import { RunnableControls } from './RunnableControls'
import { BlockEditor, isBlockDocEmpty } from './BlockEditor'

/**
 * Row usado dentro dos períodos (manhã/tarde/noite) da tela Dia.
 * Play/pause/stop completos + cronômetro para qualquer tipo (quest/task/routine).
 */
export function PlannedItemRow({ item, areas, activeSession, onSessionUpdate, onRemoveFromPlan, target, parentTitle, deliverableTitle, onOpen, migratedFromLabel }: {
  item: any
  areas: Area[]
  activeSession: ActiveSession | null
  onSessionUpdate: () => void
  onRemoveFromPlan: () => void
  target: string
  /** Breadcrumb pro card: mostrado quando item é quest subtarefa. */
  parentTitle?: string | null
  deliverableTitle?: string | null
  /** Se fornecido, o título vira clicável (usado pra navegar pro projeto
   *  quando o item é uma quest). `undefined` = título não-clicável. */
  onOpen?: () => void
  /** Rótulo do turno de origem se o item foi migrado automaticamente
   *  (ex: "manhã"). Renderiza um indicador discreto "↑ veio da manhã". */
  migratedFromLabel?: string
}) {
  const [showDescription, setShowDescription] = useState(false)
  const [descDraft, setDescDraft] = useState<string | null>(null)
  const isRoutine = !!item?.isRoutine
  const isTask = !!item?.isTask
  const kind: 'quest' | 'task' | 'routine' = isRoutine ? 'routine' : isTask ? 'task' : 'quest'

  // Auto-save da descrição com debounce de 800ms. Cada tipo tem endpoint
  // próprio: quests via patchQuest, tasks via updateTask, routines via
  // updateRoutine. Doc-vazio do BlockEditor é gravado como null.
  useEffect(() => {
    if (descDraft === null) return
    const current = item?.description ?? null
    if (descDraft === (current ?? '')) return
    const t = setTimeout(() => {
      const newVal = isBlockDocEmpty(descDraft) ? null : descDraft
      if (newVal === current) return
      const save = kind === 'quest'
        ? patchQuest(item.id, { description: newVal })
        : kind === 'task'
          ? updateTask(item.id, { description: newVal })
          : updateRoutine(item.id, { description: newVal })
      save.catch(err => reportApiError(`PlannedItemRow.save(${kind})`, err))
    }, 800)
    return () => clearTimeout(t)
  }, [descDraft, item?.description, item?.id, kind])

  const itemColor = isTask
    ? 'var(--color-gold)'
    : isRoutine
      ? 'var(--color-routine-block)'
      : (areas.find(a => a.slug === (item as Quest).area_slug)?.color || 'var(--color-text-tertiary)')

  // `id` preservado pra permitir edição/exclusão da sessão pelo
  // SessionHistoryModal (PATCH/DELETE /api/{kind}-sessions/{id}).
  const [sessions, setSessions] = useState<{ id?: number; started_at: string; ended_at: string | null }[]>([])
  useEffect(() => {
    if (!item?.id) { setSessions([]); return }
    let cancelled = false
    const loader = kind === 'quest'
      ? fetchSessions(item.id)
      : kind === 'task'
        ? fetchTaskSessions(item.id)
        : fetchRoutineSessions(item.id, target)
    loader
      .then(list => {
        if (cancelled) return
        const safe = Array.isArray(list) ? list : []
        setSessions(safe.map((s: any) => ({
          id: s?.id,
          started_at: s?.started_at ?? '',
          ended_at: s?.ended_at ?? null,
        })))
      })
      .catch(() => { if (!cancelled) setSessions([]) })
    return () => { cancelled = true }
  }, [item?.id, kind, target, activeSession?.type, activeSession?.id, activeSession?.started_at, activeSession?.ended_at])

  const done = item.status === 'done' || item.done === true
  const typeLabel = isTask ? 'Tarefa' : isRoutine ? 'Rotina' : (item as Quest).area_slug

  return (
    <div
      style={{
        background: 'var(--color-bg-tertiary)',
        border: `1px solid ${itemColor}40`,
        borderLeft: `3px solid ${itemColor}`,
        borderRadius: 'var(--radius-sm)',
        padding: 12,
        // Layout em coluna: header em linha (título + breadcrumb + meta + controles)
        // e a descrição expandida ocupa a largura total embaixo, sem espremer os
        // controles ao lado dela.
        display: 'flex', flexDirection: 'column', gap: 10,
        width: '100%', boxSizing: 'border-box', minWidth: 0, maxWidth: '100%',
        opacity: done ? 0.5 : 1,
        transition: 'border-color var(--motion-fast) var(--ease-smooth), background var(--motion-fast) var(--ease-smooth)',
      }}
      onMouseEnter={e => {
        if (done) return
        e.currentTarget.style.borderColor = `${itemColor}80`
        e.currentTarget.style.background = 'var(--glass-bg-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = `${itemColor}40`
        e.currentTarget.style.background = 'var(--color-bg-tertiary)'
      }}
    >
      {/* Header em linha — título/breadcrumb à esquerda, controles à direita */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
        width: '100%', minWidth: 0,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: itemColor, flexShrink: 0, marginTop: 4,
        }} />
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              onClick={onOpen}
              title={onOpen ? 'Abrir projeto' : undefined}
              style={{
                color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 13,
                textDecoration: done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: onOpen ? 'pointer' : 'default',
                transition: 'color 0.12s',
              }}
              onMouseEnter={e => { if (onOpen) e.currentTarget.style.color = 'var(--color-accent-light)' }}
              onMouseLeave={e => { if (onOpen) e.currentTarget.style.color = 'var(--color-text-primary)' }}
            >
              {item.title}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowDescription(!showDescription)
              }}
              title={item?.description ? (showDescription ? 'Ocultar descrição' : 'Ver descrição') : 'Adicionar descrição'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: item?.description ? 'var(--color-accent-light)' : 'var(--color-text-tertiary)',
                fontSize: 10, padding: '2px 4px',
                display: 'inline-flex', alignItems: 'center', gap: 3,
                transition: 'color 0.15s', flexShrink: 0,
                opacity: item?.description ? 1 : 0.6,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
              onMouseLeave={e => (e.currentTarget.style.color = item?.description ? 'var(--color-accent-light)' : 'var(--color-text-tertiary)')}
            >
              <span style={{ fontSize: 9 }}>{showDescription ? '▼' : '▶'}</span>
              <span style={{ fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase' }}>info</span>
            </button>
          </div>
          {(parentTitle || deliverableTitle) && (
            <div style={{
              fontSize: 9, color: 'var(--color-text-tertiary)',
              marginTop: 2,
              display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap',
            }}>
              {parentTitle && <span>{parentTitle}</span>}
              {parentTitle && deliverableTitle && (
                <span style={{ color: 'var(--color-text-muted)' }}>›</span>
              )}
              {deliverableTitle && (
                <span style={{ color: 'var(--color-accent-light)' }}>{deliverableTitle}</span>
              )}
            </div>
          )}
          <div style={{
            fontSize: 10, color: 'var(--color-text-tertiary)',
            display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap',
          }}>
            <span style={{
              color: isRoutine ? 'var(--color-success)'
                : isTask ? 'var(--color-accent-light)'
                : 'var(--color-text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{typeLabel}</span>
            {item.estimated_minutes && <span>~{item.estimated_minutes}m</span>}
            {item.duration_minutes && <span>~{item.duration_minutes}m</span>}
            {(item.start_time && item.end_time) && (
              <span style={{ fontFamily: 'monospace' }}>{item.start_time}–{item.end_time}</span>
            )}
            {migratedFromLabel && (
              <span
                title={`Migrado automaticamente da ${migratedFromLabel} porque o turno encerrou`}
                style={{
                  color: 'var(--color-text-muted)',
                  fontStyle: 'italic',
                  letterSpacing: '0.02em',
                }}
              >
                ↑ veio da {migratedFromLabel}
              </span>
            )}
          </div>
        </div>
        <RunnableControls
          runnableType={kind}
          id={item.id}
          sessions={sessions}
          activeSession={activeSession}
          onSessionUpdate={onSessionUpdate}
          target={kind === 'routine' ? target : undefined}
          done={done}
          onReopen={async () => {
            try {
              if (kind === 'quest') await patchQuest(item.id, { status: 'doing' })
              else if (kind === 'task') await updateTask(item.id, { done: false })
              else await toggleRoutine(item.id)
              onSessionUpdate()
            } catch (err) {
              console.error('[runnable] reopen failed', { kind, id: item.id, err })
              alert('Erro ao reabrir — veja o console (F12).')
            }
          }}
        />
        <button
          onClick={onRemoveFromPlan}
          title="remover do plano do dia"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', fontSize: 14, padding: '0 6px',
            opacity: 0.5, transition: 'opacity 0.15s, color 0.15s',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.color = 'var(--color-accent-light)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '0.5'
            e.currentTarget.style.color = 'var(--color-text-tertiary)'
          }}
        >
          ✕
        </button>
      </div>

      {/* Descrição expandida — fora da coluna do header, ocupa a largura toda */}
      {showDescription && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ width: '100%' }}
        >
          <BlockEditor
            value={descDraft ?? item?.description ?? ''}
            onChange={setDescDraft}
            placeholder="Digite / pra ver os blocos…"
            minHeight={80}
          />
        </div>
      )}
    </div>
  )
}

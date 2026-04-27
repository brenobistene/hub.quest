import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, GripVertical } from 'lucide-react'
import type { Area, Project, Quest } from '../types'
import {
  fetchQuestsByProject, fetchDeliverables,
  createQuest, deleteQuest,
  createDeliverable, updateDeliverable, deleteDeliverable, reorderDeliverables,
  fetchSessions,
  reportApiError,
} from '../api'
import { parseIsoAsUtc, sumClosedSessionsSeconds, formatHMS, parseTimeToMinutes, minutesToHmm, isValidDateInput } from '../utils/datetime'
import { formatDateBR } from '../utils/quests'
import { InlineText } from './ui/InlineText'
import { Label } from './ui/Label'
import { PrioritySelect } from './PrioritySelect'
import { StatusDropdown } from './StatusDropdown'
import { BlockEditor, isBlockDocEmpty } from './BlockEditor'

type Deliverable = {
  id: string
  title: string
  done: boolean
  estimated_minutes?: number | null
  deadline?: string | null
  executed_minutes?: number
  minutes_worked?: number
  sort_order?: number
}

/**
 * Painel de detalhe do PROJETO. Mostra título editável, área/status/deadline,
 * lista de deliverables com CRUD inline + drag-reorder, e dentro de cada
 * deliverable a lista de quests (subtarefas) com Play, descrição notion-like,
 * edição inline, drag-reorder e criação scoped.
 *
 * Project e Quest agora são entidades SEPARADAS — este painel edita apenas
 * Project no header e passa callbacks dedicados pra cada nível.
 */
export function QuestDetailPanel({
  project,
  onClose,
  onProjectUpdate,
  onQuestUpdate,
  quests: quests,
  area,
  onQuestCreate,
  onQuestDelete,
  onSessionUpdate,
}: {
  project: Project
  onClose: () => void
  onProjectUpdate: (id: string, patch: Partial<Project>) => void
  onQuestUpdate: (id: string, patch: Partial<Quest>) => void
  quests: Quest[]
  area?: Area
  onQuestCreate: (q: Quest) => void
  onQuestDelete: (id: string) => void
  onSessionUpdate?: () => void
}) {
  // area + onSessionUpdate recebidos pra API completa da página-cliente mas
  // não usados diretamente aqui (herdados de quando o painel suportava
  // subtarefas inline).
  void area; void onSessionUpdate;
  // Subtasks carregadas do backend (escopadas ao projeto). Usamos estado
  // local pra UI ser responsiva — updates otimistas refletem aqui antes do
  // refetch.
  const [subtasks, setSubtasks] = useState<Quest[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [newDeliverableTitle, setNewDeliverableTitle] = useState('')
  const [newDeliverableDeadline, setNewDeliverableDeadline] = useState<string>('')
  const [creatingDeliverable, setCreatingDeliverable] = useState(false)
  // Quais entregáveis estão com a lista de quests expandida. Começa sempre
  // expandido pra dar visibilidade; usuário colapsa se quiser.
  const [collapsedDelivIds, setCollapsedDelivIds] = useState<Set<string>>(new Set())
  // Quais quests (dentro dos cards) estão com detalhes abertos.
  const [expandedQuestIds, setExpandedQuestIds] = useState<Set<string>>(new Set())
  // Título da nova quest por deliverable (input scoped ao card).
  const [newQuestByDeliv, setNewQuestByDeliv] = useState<Record<string, string>>({})
  // Tempo estimado da nova quest por deliverable (em minutos ou h:mm).
  const [newQuestEstByDeliv, setNewQuestEstByDeliv] = useState<Record<string, string>>({})
  // Sessões por quest — necessário pra mostrar "tempo gasto" no card compacto.
  const [sessionsByQuest, setSessionsByQuest] = useState<Record<string, { started_at: string; ended_at: string | null }[]>>({})
  // Draft local para descrição de cada quest — salva com debounce.
  const [descriptionDraft, setDescriptionDraft] = useState<Record<string, string>>({})
  // Draft local pras "informações detalhadas" (notes) do projeto — mesma
  // lógica de debounce, mas escopado num único campo só.
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  // Drag-and-drop state para reordenação de entregáveis
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [hasManualOrder, setHasManualOrder] = useState(false)
  // Drag-and-drop state para reordenação de quests (session-only)
  const [draggedQuestId, setDraggedQuestId] = useState<string | null>(null)
  const [dragOverQuestId, setDragOverQuestId] = useState<string | null>(null)
  const [questOrder, setQuestOrder] = useState<Record<string, string[]>>({})

  // Quantos projetos ativos tem nessa área (exceto este). Usado pro breadcrumb.
  const areaQuestCount = quests ? quests.filter(q => q.area_slug === project.area_slug && q.status !== 'done').length : 0

  useEffect(() => {
    fetchQuestsByProject(project.id).then(setSubtasks).catch(err => reportApiError('QuestDetailPanel', err))
    fetchDeliverables(project.id).then(setDeliverables).catch(err => reportApiError('QuestDetailPanel', err))
  }, [project.id])

  // Carrega sessões de todas as subtasks pra poder mostrar `tempo gasto` nos
  // cards compactos dentro dos deliverables. N requests em paralelo — aceitável
  // pra projetos com até ~30 quests.
  useEffect(() => {
    if (subtasks.length === 0) { setSessionsByQuest({}); return }
    let cancelled = false
    Promise.all(subtasks.map(st =>
      fetchSessions(st.id)
        .then(s => ({ id: st.id, sessions: (s as any[]).map(x => ({ started_at: x?.started_at ?? '', ended_at: x?.ended_at ?? null })) }))
        .catch(() => ({ id: st.id, sessions: [] as { started_at: string; ended_at: string | null }[] }))
    )).then(results => {
      if (cancelled) return
      const map: Record<string, { started_at: string; ended_at: string | null }[]> = {}
      for (const r of results) map[r.id] = r.sessions
      setSessionsByQuest(map)
    })
    return () => { cancelled = true }
  }, [subtasks.map(s => s.id).join(',')])

  // Auto-save descrição com debounce quando o draft mudar. Trata doc-vazio
  // do BlockEditor como `null` pra não poluir o banco com JSON vazio.
  useEffect(() => {
    const timeoutIds: Record<string, ReturnType<typeof setTimeout>> = {}
    const keys = Object.keys(descriptionDraft)

    keys.forEach(questId => {
      const draft = descriptionDraft[questId]
      const current = subtasks.find(st => st.id === questId)?.description ?? null

      if (draft !== (current ?? '')) {
        timeoutIds[questId] = setTimeout(() => {
          const newVal = isBlockDocEmpty(draft) ? null : draft
          if (newVal !== current) {
            handleUpdate(questId, { description: newVal })
          }
        }, 800)
      }
    })

    return () => Object.values(timeoutIds).forEach(t => clearTimeout(t))
  }, [descriptionDraft, subtasks])

  // Auto-save dos notes do projeto com a mesma lógica. Dispara só quando
  // `notesDraft` é não-nulo (ou seja, o usuário editou nesta sessão).
  useEffect(() => {
    if (notesDraft === null) return
    const current = project.notes ?? null
    if (notesDraft === (current ?? '')) return
    const t = setTimeout(() => {
      const newVal = isBlockDocEmpty(notesDraft) ? null : notesDraft
      if (newVal !== current) onProjectUpdate(project.id, { notes: newVal })
    }, 800)
    return () => clearTimeout(t)
  }, [notesDraft, project.notes, project.id, onProjectUpdate])

  // Update otimista de subtask + dispara o callback global do App.
  // Quando o patch muda `status` ou `deliverable_id`, o backend pode
  // marcar/desmarcar o `done` do entregável (auto-sync: todas as quests
  // fechadas → entregável vira done). Refazemos o fetch dos deliverables
  // pra UI refletir sem F5.
  const handleUpdate = (id: string, patch: Partial<Quest>) => {
    setSubtasks(sts => sts.map(st => st.id === id ? { ...st, ...patch } : st))
    onQuestUpdate(id, patch)
    if ('status' in patch || 'deliverable_id' in patch) {
      fetchDeliverables(project.id)
        .then(setDeliverables)
        .catch(err => reportApiError('QuestDetailPanel', err))
    }
  }

  function addQuestToDeliverable(delivId: string) {
    const title = (newQuestByDeliv[delivId] || '').trim()
    if (!title) return
    const estimatedMinutes = parseTimeToMinutes(newQuestEstByDeliv[delivId] || '')
    createQuest({
      title,
      area_slug: project.area_slug,
      project_id: project.id,
      deliverable_id: delivId,
      estimated_minutes: estimatedMinutes,
    })
      .then(q => {
        fetchQuestsByProject(project.id).then(setSubtasks).catch(err => reportApiError('QuestDetailPanel', err))
        setNewQuestByDeliv(prev => ({ ...prev, [delivId]: '' }))
        setNewQuestEstByDeliv(prev => ({ ...prev, [delivId]: '' }))
        if (onQuestCreate) onQuestCreate(q)
      })
      .catch((err: any) => {
        console.error('Erro ao criar quest:', err)
        alert(err?.message ?? 'Erro ao criar quest')
      })
  }

  function removeSubtask(id: string) {
    if (!window.confirm('Deletar esta quest?')) return
    deleteQuest(id)
      .then(() => {
        setSubtasks(s => s.filter(st => st.id !== id))
        if (onQuestDelete) onQuestDelete(id)
      })
      .catch(err => reportApiError('QuestDetailPanel', err))
  }

  function toggleQuestDone(q: Quest) {
    const nextStatus = q.status === 'done' ? 'pending' : 'done'
    handleUpdate(q.id, { status: nextStatus })
  }

  function addDeliverable() {
    if (!newDeliverableTitle.trim()) return
    createDeliverable(project.id, newDeliverableTitle, {
      deadline: newDeliverableDeadline || null,
    })
      .then(newDeliv => {
        setDeliverables([...deliverables, newDeliv])
        setNewDeliverableTitle('')
        setNewDeliverableDeadline('')
        setCreatingDeliverable(false)
      })
      .catch(err => {
        console.error('Erro ao criar entregável:', err)
      })
  }

  function toggleDeliverableDone(id: string) {
    const deliv = deliverables.find(d => d.id === id)
    if (!deliv) return
    updateDeliverable(id, { done: !deliv.done })
      .then(updated => {
        setDeliverables(prev => prev.map(d => d.id === id ? updated : d))
      })
      .catch(err => reportApiError('QuestDetailPanel', err))
  }

  function patchDeliverable(id: string, patch: Partial<Deliverable>) {
    // Optimistic update pra UI responder na hora; rollback em erro.
    const prev = deliverables
    setDeliverables(prev.map(d => d.id === id ? { ...d, ...patch } : d))
    updateDeliverable(id, patch)
      .then(updated => setDeliverables(curr => curr.map(d => d.id === id ? updated : d)))
      .catch(() => setDeliverables(prev))
  }

  function handleDeleteDeliverable(id: string) {
    if (!window.confirm('Deletar este entregável?')) return
    deleteDeliverable(id)
      .then(() => setDeliverables(prev => prev.filter(d => d.id !== id)))
      .catch((err: any) => {
        // 409 quando ainda tem quests amarradas
        alert(err?.detail ?? err?.message ?? 'Erro ao deletar entregável')
      })
  }

  function toggleDelivCollapsed(id: string) {
    setCollapsedDelivIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleQuestExpanded(id: string) {
    setExpandedQuestIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Formata minutos como "2h 30m" ou "45m".
  const fmtMin = (m: number): string => {
    const h = Math.floor(m / 60)
    const r = m % 60
    if (h > 0 && r > 0) return `${h}h ${r}m`
    if (h > 0) return `${h}h`
    return `${r}m`
  }

  const questsForDelivId = (delivId: string) =>
    subtasks.filter(st => st.deliverable_id === delivId)

  const getQuestsForDelivInOrder = (delivId: string) => {
    const quests = questsForDelivId(delivId)
    if (!questOrder[delivId]) return quests
    const order = questOrder[delivId]
    return order.map(id => quests.find(q => q.id === id)).filter(Boolean) as Quest[]
  }

  const questDurationSec = (questId: string) =>
    sumClosedSessionsSeconds(sessionsByQuest[questId] ?? [])

  const completedDeliverables = deliverables.filter(d => d.done).length

  // Calcula tempo estimado de um entregável somando as quests filhas
  const getDeliverableEstimated = (delivId: string) =>
    questsForDelivId(delivId).reduce((sum, q) => sum + (q.estimated_minutes ?? 0), 0)

  // Totais do projeto: previsto = soma de tempos estimados dos entregáveis (calculado a partir das quests);
  // executado = soma de `worked_minutes` das subquests (tempo real de sessão).
  const totalEstimatedMin = deliverables.reduce((s, d) => s + getDeliverableEstimated(d.id), 0)
  const totalExecutedMin = subtasks.reduce((s, q) => s + (q.worked_minutes ?? 0), 0)
  // Progresso da barra = entregáveis concluídos, ponderados pelo tempo previsto
  // de cada um. Se nenhum tem estimativa, cai pra contagem simples (N/total).
  // Assim, tickar um entregável move a barra imediatamente.
  const doneEstimatedMin = deliverables.filter(d => d.done).reduce((s, d) => s + getDeliverableEstimated(d.id), 0)
  const totalProgressPct = (() => {
    if (totalEstimatedMin > 0) return Math.min(100, Math.round((doneEstimatedMin / totalEstimatedMin) * 100))
    if (deliverables.length > 0) return Math.round((completedDeliverables / deliverables.length) * 100)
    return 0
  })()

  const sortedDeliverables = hasManualOrder
    ? deliverables
    : [...deliverables].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.localeCompare(b.deadline)
    })

  function handleDragStart(id: string) {
    setDraggedId(id)
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (id !== draggedId) setDragOverId(id)
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return }
    const list = [...sortedDeliverables]
    const fromIdx = list.findIndex(d => d.id === draggedId)
    const toIdx = list.findIndex(d => d.id === targetId)
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    setDeliverables(list)
    setHasManualOrder(true)
    setDraggedId(null)
    setDragOverId(null)
    reorderDeliverables(project.id, list.map(d => d.id)).catch(err => reportApiError('QuestDetailPanel.reorderDeliverables', err))
  }

  function handleDragEnd() {
    setDraggedId(null)
    setDragOverId(null)
  }

  function handleQuestDragStart(questId: string) {
    setDraggedQuestId(questId)
  }

  function handleQuestDragOver(e: React.DragEvent, questId: string) {
    e.preventDefault()
    setDragOverQuestId(questId)
  }

  function handleQuestDrop(targetQuestId: string, delivId: string) {
    if (!draggedQuestId || draggedQuestId === targetQuestId) {
      setDraggedQuestId(null)
      setDragOverQuestId(null)
      return
    }
    const questsInDeliv = questsForDelivId(delivId)
    const fromIdx = questsInDeliv.findIndex(q => q.id === draggedQuestId)
    const toIdx = questsInDeliv.findIndex(q => q.id === targetQuestId)
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedQuestId(null)
      setDragOverQuestId(null)
      return
    }
    const reordered = [...questsInDeliv]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setQuestOrder(prev => ({ ...prev, [delivId]: reordered.map(q => q.id) }))
    setDraggedQuestId(null)
    setDragOverQuestId(null)
  }

  function handleQuestDragEnd() {
    setDraggedQuestId(null)
    setDragOverQuestId(null)
  }

  // Controle de edição inline: só uma célula editando por vez. Formato:
  // `{delivId}:deadline` ou `{delivId}:estimated`. Click abre, blur/Enter fecha.
  const [editingField, setEditingField] = useState<string | null>(null)

  return (
    <div>
      <button onClick={onClose} style={{
        background: 'none', border: '1px solid transparent', cursor: 'pointer',
        color: 'var(--color-text-tertiary)', fontSize: 10, marginBottom: 28,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        transition: 'all 0.2s', padding: '6px 8px', borderRadius: 4,
      }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--color-accent-light)'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--color-text-tertiary)'
          e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        ✕ fechar
      </button>

      <div style={{ marginBottom: 16 }}>
        <InlineText
          value={project.title}
          onSave={v => onProjectUpdate(project.id, { title: v })}
          style={{ color: 'var(--color-text-primary)', fontSize: 22, fontWeight: 700, display: 'block', letterSpacing: '-0.01em' }}
        />
        {(totalEstimatedMin > 0 || totalExecutedMin > 0 || deliverables.length > 0) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            marginTop: 10,
            fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--color-text-tertiary)',
          }}>
            {totalEstimatedMin > 0 && (
              <span>
                <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginRight: 6 }}>previsto</span>
                {fmtMin(totalEstimatedMin)}
              </span>
            )}
            {totalExecutedMin > 0 && (
              <span>
                <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginRight: 6 }}>executado</span>
                <span style={{
                  color: totalEstimatedMin > 0 && totalExecutedMin > totalEstimatedMin
                    ? 'var(--color-accent-primary)'
                    : 'var(--color-text-secondary)',
                }}>
                  {fmtMin(totalExecutedMin)}
                </span>
                {totalEstimatedMin > 0 && ` · ${totalProgressPct}%`}
              </span>
            )}
            {deliverables.length > 0 && (
              <span>
                <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginRight: 6 }}>entregáveis</span>
                {completedDeliverables}/{deliverables.length}
              </span>
            )}
            {subtasks.length > 0 && (
              <span>
                <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginRight: 6 }}>quests</span>
                {subtasks.filter(q => q.status === 'done').length}/{subtasks.length}
              </span>
            )}
          </div>
        )}

        {deliverables.length > 0 && (
          <div style={{ marginTop: 12, maxWidth: 520 }}>
            <div style={{
              height: 4, borderRadius: 2,
              background: 'var(--color-bg-tertiary)',
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, totalProgressPct)}%`,
                background: totalProgressPct >= 100
                  ? 'var(--color-success)'
                  : 'var(--color-accent-light)',
                transition: 'width 0.3s ease-out',
              }} />
              {totalEstimatedMin > 0 && totalExecutedMin > totalEstimatedMin && (
                <div
                  title="Tempo executado passou do previsto"
                  style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0,
                    width: 2, background: 'var(--color-accent-primary)',
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Meta row: área · deadline · prioridade · finalizar/cancelar/reabrir. */}
      <div style={{
        display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 28, paddingBottom: 16, borderBottom: '1px solid var(--color-divider)',
      }}>
          <span style={{
            fontSize: 10, color: 'var(--color-text-tertiary)',
            letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            {project.area_slug}
          </span>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
              deadline
            </span>
            <input
              type="date"
              autoComplete="off"
              value={project.deadline || ''}
              onChange={e => {
                if (isValidDateInput(e.target.value)) {
                  onProjectUpdate(project.id, { deadline: e.target.value || null })
                }
              }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: '1px solid transparent',
                color: 'var(--color-text-primary)', fontSize: 12, padding: '4px 2px',
                outline: 'none', colorScheme: 'dark', fontFamily: "'IBM Plex Mono', monospace",
                transition: 'border-color 0.15s',
              } as any}
              onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'var(--color-border)')}
              onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderBottomColor = 'transparent' }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-light)')}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
            />
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
              prioridade
            </span>
            <PrioritySelect
              value={project.priority || 'medium'}
              onChange={v => onProjectUpdate(project.id, { priority: v })}
            />
          </label>

          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {project.status !== 'done' && project.status !== 'cancelled' ? (
              <>
                <button
                  onClick={() => {
                    if (window.confirm('Marcar este projeto como finalizado?')) {
                      // Seta completed_at localmente pro filtro "hoje" pegar
                      // imediatamente, antes do refetch do backend.
                      onProjectUpdate(project.id, { status: 'done', completed_at: new Date().toISOString() })
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-accent-primary)',
                    cursor: 'pointer',
                    color: 'var(--color-accent-primary)',
                    padding: '6px 12px', fontSize: 10, fontWeight: 700,
                    borderRadius: 3, letterSpacing: '0.1em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--color-accent-primary)'
                    e.currentTarget.style.color = 'var(--color-bg-primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--color-accent-primary)'
                  }}
                >
                  <CheckCircle2 size={11} strokeWidth={2.2} />
                  Finalizar
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Cancelar este projeto? Ele sai dos painéis de acompanhamento, mas fica no histórico.')) {
                      onProjectUpdate(project.id, { status: 'cancelled', completed_at: new Date().toISOString() })
                    }
                  }}
                  title="Cancelar projeto"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    padding: '4px 6px', fontSize: 9, fontWeight: 500,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                  cancelar
                </button>
              </>
            ) : project.status === 'done' ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 3,
                border: '1px solid var(--color-success)',
                background: 'rgba(90, 122, 106, 0.08)',
              }}>
                <CheckCircle2 size={11} strokeWidth={2.2} color="var(--color-success)" />
                <span style={{ fontSize: 10, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  Finalizado
                  {project.completed_at && (
                    <span style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', marginLeft: 6, fontWeight: 400 }}>
                      · {parseIsoAsUtc(project.completed_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => {
                    if (window.confirm('Reabrir este projeto? Ele volta para "em andamento".')) {
                      onProjectUpdate(project.id, { status: 'doing', completed_at: null })
                    }
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', fontSize: 10,
                    padding: '0 4px', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  Reabrir
                </button>
              </div>
            ) : (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 3,
                border: '1px solid var(--color-text-tertiary)',
                background: 'var(--color-bg-tertiary)',
              }}>
                <XCircle size={11} strokeWidth={2.2} color="var(--color-text-tertiary)" />
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  Cancelado
                  {project.completed_at && (
                    <span style={{ color: 'var(--color-text-muted)', letterSpacing: '0.05em', marginLeft: 6, fontWeight: 400 }}>
                      · {parseIsoAsUtc(project.completed_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => {
                    if (window.confirm('Reabrir este projeto? Ele volta para "em andamento".')) {
                      onProjectUpdate(project.id, { status: 'doing', completed_at: null })
                    }
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', fontSize: 10,
                    padding: '0 4px', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  Reabrir
                </button>
              </div>
            )}
          </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{
          marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <Label>entregáveis{deliverables.length > 0 && ` (${deliverables.length})`}</Label>
          {!creatingDeliverable && (
            <button
              onClick={() => setCreatingDeliverable(true)}
              style={{
                background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                color: 'var(--color-text-tertiary)', fontSize: 10,
                padding: '5px 12px', borderRadius: 3,
                letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-accent-light)'
                e.currentTarget.style.borderColor = 'var(--color-accent-light)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
              }}
            >
              + criar entregável
            </button>
          )}
        </div>

        {/* Novo entregável: título + deadline + criar */}
        {creatingDeliverable && (
        <div style={{
          display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
          marginBottom: 18, paddingBottom: 10, borderBottom: '1px solid var(--color-divider)',
        }}>
          <input
            type="text"
            autoComplete="off"
            value={newDeliverableTitle}
            onChange={e => setNewDeliverableTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addDeliverable() }}
            placeholder="Novo entregável…"
            style={{
              flex: '1 1 180px', minWidth: 160,
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)', padding: '6px 2px', fontSize: 13,
              outline: 'none', transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-primary)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--color-border)')}
          />
          <input
            type="date"
            autoComplete="off"
            value={newDeliverableDeadline}
            onChange={e => {
              if (isValidDateInput(e.target.value)) setNewDeliverableDeadline(e.target.value)
            }}
            title="Deadline"
            style={{
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)', padding: '6px 2px', fontSize: 12,
              outline: 'none', colorScheme: 'dark',
              fontFamily: "'IBM Plex Mono', monospace",
              transition: 'border-color 0.15s',
            } as any}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-light)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--color-border)')}
          />
          <button
            onClick={addDeliverable}
            disabled={!newDeliverableTitle.trim()}
            style={{
              background: newDeliverableTitle.trim() ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
              color: newDeliverableTitle.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
              border: 'none',
              cursor: newDeliverableTitle.trim() ? 'pointer' : 'not-allowed',
              padding: '8px 14px', fontSize: 11, fontWeight: 700,
              borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            + novo
          </button>
          <button
            onClick={() => {
              setCreatingDeliverable(false)
              setNewDeliverableTitle('')
              setNewDeliverableDeadline('')
            }}
            title="Cancelar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 14, padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>
        )}

        {deliverables.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
            Nenhum entregável ainda. Crie um acima — toda quest deste projeto precisa estar amarrada a um entregável.
          </div>
        )}

        {/* Cards dos entregáveis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(() => {
            // Comparação por string YYYY-MM-DD evita o bug de timezone que
            // acontecia com `new Date(d.deadline) < new Date()` (o primeiro
            // parseia como UTC-midnight e vira ontem à noite em BRT).
            const _t = new Date()
            const todayYmd = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`
            return sortedDeliverables.map(d => {
            const delivQuests = getQuestsForDelivInOrder(d.id)
            const activeQuests = delivQuests.filter(q => q.status !== 'done')
            const doneQuests = delivQuests.filter(q => q.status === 'done')
            const collapsed = collapsedDelivIds.has(d.id)
            const executed = d.executed_minutes ?? 0
            // Tempo estimado = soma dos tempos das quests filhas (calculado dinamicamente)
            const estimated = delivQuests.reduce((sum, q) => sum + (q.estimated_minutes ?? 0), 0)
            const pct = estimated > 0 ? Math.min(100, Math.round((executed / estimated) * 100)) : 0
            const over = estimated > 0 && executed > estimated
            const barColor = over
              ? 'var(--color-accent-primary)'
              : 'var(--color-success)'
            const deadlineOverdue = !!d.deadline && !d.done && d.deadline < todayYmd

            return (
              <div
                key={d.id}
                onDragOver={(e) => handleDragOver(e, d.id)}
                onDrop={() => handleDrop(d.id)}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: `1px solid ${d.done ? 'var(--color-success)' : 'var(--color-border)'}`,
                  borderLeft: `3px solid ${d.done ? 'var(--color-success)' : 'var(--color-accent-light)'}`,
                  borderRadius: 4,
                  padding: '12px 14px',
                  opacity: draggedId === d.id ? 0.45 : (d.done ? 0.75 : 1),
                  borderTop: dragOverId === d.id ? '2px solid var(--color-accent-primary)' : '1px solid transparent',
                  transition: 'opacity 0.15s, border-color 0.15s, border-top 0.15s',
                }}
              >
                {/* Header do card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!d.done && (
                    <div
                      draggable={true}
                      onDragStart={() => handleDragStart(d.id)}
                      onDragEnd={handleDragEnd}
                      style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      <GripVertical size={14} style={{ color: 'var(--color-text-muted)', cursor: 'grab', opacity: 0.5 }} />
                    </div>
                  )}
                  <button
                    onClick={() => toggleDeliverableDone(d.id)}
                    title={d.done ? 'Desmarcar como feito' : 'Marcar como feito'}
                    style={{
                      width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${d.done ? 'var(--color-success)' : 'var(--color-text-tertiary)'}`,
                      background: d.done ? 'var(--color-success)' : 'transparent',
                      cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {d.done && <CheckCircle2 size={12} color="var(--color-bg-primary)" strokeWidth={3} />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <InlineText
                      value={d.title}
                      onSave={(v) => patchDeliverable(d.id, { title: v })}
                      style={{
                        color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600,
                        textDecoration: d.done ? 'line-through' : 'none',
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 5, flexWrap: 'wrap', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {/* Deadline — display por padrão, input ao clicar. */}
                      {editingField === `${d.id}:deadline` ? (
                        <input
                          type="date"
                          autoComplete="off"
                          autoFocus
                          defaultValue={d.deadline ?? ''}
                          onChange={e => {
                            if (isValidDateInput(e.target.value)) {
                              patchDeliverable(d.id, { deadline: e.target.value || null })
                            }
                          }}
                          onBlur={() => setEditingField(null)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur()
                          }}
                          style={{
                            background: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-accent-light)',
                            color: 'var(--color-text-primary)',
                            fontSize: 10, padding: '2px 5px', borderRadius: 2, outline: 'none',
                            fontFamily: "'IBM Plex Mono', monospace",
                            colorScheme: 'dark',
                          } as any}
                        />
                      ) : (
                        <button
                          onClick={() => setEditingField(`${d.id}:deadline`)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: d.deadline
                              ? (deadlineOverdue ? 'var(--color-accent-light)' : 'var(--color-text-secondary)')
                              : 'var(--color-text-muted)',
                            fontSize: 10, padding: '2px 0', fontFamily: "'IBM Plex Mono', monospace",
                            fontStyle: d.deadline ? 'normal' : 'italic',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = d.deadline
                              ? (deadlineOverdue ? 'var(--color-accent-light)' : 'var(--color-text-secondary)')
                              : 'var(--color-text-muted)'
                          }}
                        >
                          {d.deadline ? formatDateBR(d.deadline) : '+ prazo'}
                          {deadlineOverdue && <span style={{ marginLeft: 4 }}>· atrasado</span>}
                        </button>
                      )}

                      {/* Previsto — calculado dinamicamente a partir das quests filhas (read-only) */}
                      {estimated > 0 && (
                        <span style={{
                          color: 'var(--color-text-secondary)', fontSize: 10,
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}>
                          ~{fmtMin(estimated)} previsto
                        </span>
                      )}

                      {/* Executado (read-only) */}
                      {executed > 0 && (
                        <span style={{
                          color: over ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                        }}>
                          {fmtMin(executed)} feitos
                          {over && ` (+${fmtMin(executed - estimated)})`}
                        </span>
                      )}

                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {doneQuests.length}/{delivQuests.length} quests
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleDelivCollapsed(d.id)}
                    title={collapsed ? 'Mostrar quests' : 'Ocultar quests'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', fontSize: 11, padding: '2px 6px',
                    }}
                  >
                    {collapsed ? '▶' : '▼'}
                  </button>
                </div>

                {/* Progress bar executado/previsto */}
                {estimated > 0 && (
                  <div style={{ marginTop: 8, height: 3, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, background: barColor,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}

                {/* Lista de quests (colapsável) + input nova quest */}
                {!collapsed && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...activeQuests, ...doneQuests].map(q => {
                      const sec = questDurationSec(q.id)
                      const expanded = expandedQuestIds.has(q.id)
                      return (
                        <div
                          key={q.id}
                          onDragOver={(e) => handleQuestDragOver(e, q.id)}
                          onDrop={() => handleQuestDrop(q.id, d.id)}
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 3,
                            padding: '8px 10px',
                            opacity: draggedQuestId === q.id ? 0.45 : (q.status === 'done' ? 0.65 : 1),
                            borderTop: dragOverQuestId === q.id ? '2px solid var(--color-accent-primary)' : '1px solid transparent',
                            transition: 'opacity 0.15s, border-top 0.15s',
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {q.status !== 'done' && (
                              <div
                                draggable={true}
                                onDragStart={() => handleQuestDragStart(q.id)}
                                onDragEnd={handleQuestDragEnd}
                                style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                              >
                                <GripVertical size={12} style={{ color: 'var(--color-text-muted)', cursor: 'grab', opacity: 0.5 }} />
                              </div>
                            )}
                            <button
                              onClick={() => toggleQuestDone(q)}
                              title={q.status === 'done' ? 'Reabrir quest' : 'Marcar como feita'}
                              style={{
                                width: 14, height: 14, flexShrink: 0, padding: 0,
                                background: q.status === 'done' ? 'var(--color-success)' : 'transparent',
                                border: `1.5px solid ${q.status === 'done' ? 'var(--color-success)' : 'var(--color-text-tertiary)'}`,
                                borderRadius: '50%', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {q.status === 'done' && <CheckCircle2 size={9} color="var(--color-bg-primary)" strokeWidth={2.5} />}
                            </button>
                            <InlineText
                              value={q.title}
                              onSave={v => handleUpdate(q.id, { title: v })}
                              style={{
                                flex: 1, minWidth: 0, fontSize: 12,
                                color: q.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                                textDecoration: q.status === 'done' ? 'line-through' : 'none',
                              }}
                            />
                            {q.estimated_minutes != null && q.estimated_minutes > 0 && (
                              <span
                                title="Tempo estimado"
                                style={{
                                  fontSize: 10, color: 'var(--color-text-tertiary)',
                                  fontFamily: "'IBM Plex Mono', monospace",
                                }}
                              >
                                ~{fmtMin(q.estimated_minutes)}
                              </span>
                            )}
                            {sec > 0 && (
                              <span
                                title="Tempo real gasto (sessões)"
                                style={{
                                  fontSize: 10,
                                  color: q.status === 'done' ? 'var(--color-success)' : 'var(--color-text-secondary)',
                                  fontFamily: "'IBM Plex Mono', monospace",
                                }}
                              >
                                {formatHMS(sec)}
                              </span>
                            )}
                            <button
                              onClick={() => toggleQuestExpanded(q.id)}
                              title={expanded ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-text-tertiary)', fontSize: 10, padding: '2px 4px',
                              }}
                            >
                              {expanded ? '▼' : '▶'}
                            </button>
                          </div>

                          {expanded && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div>
                                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Descrição:</span>
                                <BlockEditor
                                  value={descriptionDraft[q.id] ?? q.description ?? ''}
                                  onChange={v => setDescriptionDraft(prev => ({ ...prev, [q.id]: v }))}
                                  placeholder="Digite / pra ver os blocos…"
                                  minHeight={80}
                                />
                              </div>
                              <div>
                                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 6 }}>Próximo passo:</span>
                                <InlineText
                                  value={q.next_action ?? ''}
                                  onSave={v => handleUpdate(q.id, { next_action: v || null })}
                                  style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Estimativa:</span>
                                <input
                                  type="text"
                                  autoComplete="off"
                                  defaultValue={q.estimated_minutes ? minutesToHmm(q.estimated_minutes) : ''}
                                  placeholder="h:mm"
                                  onBlur={e => {
                                    const parsed = parseTimeToMinutes(e.target.value)
                                    const next = parsed ?? null
                                    if (next !== (q.estimated_minutes ?? null)) {
                                      handleUpdate(q.id, { estimated_minutes: next })
                                    }
                                    e.currentTarget.style.borderBottomColor = 'var(--color-border)'
                                  }}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                                  style={{
                                    width: 70, background: 'transparent',
                                    border: 'none',
                                    borderBottom: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                    fontSize: 11, padding: '4px 2px', outline: 'none',
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    transition: 'border-color 0.15s',
                                  }}
                                  onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-light)')}
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Status:</span>
                                <StatusDropdown status={q.status} onChange={s => handleUpdate(q.id, { status: s })} />
                                <button
                                  onClick={() => removeSubtask(q.id)}
                                  style={{
                                    marginLeft: 'auto',
                                    background: 'none', border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-tertiary)', cursor: 'pointer',
                                    fontSize: 10, padding: '4px 8px', borderRadius: 3,
                                    letterSpacing: '0.08em', textTransform: 'uppercase',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.color = 'var(--color-accent-light)'
                                    e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                                    e.currentTarget.style.borderColor = 'var(--color-border)'
                                  }}
                                >
                                  deletar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Input de nova quest scoped ao deliverable: título + tempo estimado */}
                    <div style={{
                      display: 'flex', gap: 10, marginTop: 6, paddingTop: 8,
                      borderTop: '1px dashed var(--color-divider)',
                      alignItems: 'center',
                    }}>
                      <span style={{
                        fontSize: 14, color: 'var(--color-text-muted)',
                        lineHeight: 1, paddingBottom: 2,
                      }}>+</span>
                      <input
                        type="text"
                        autoComplete="off"
                        value={newQuestByDeliv[d.id] ?? ''}
                        onChange={e => setNewQuestByDeliv(prev => ({ ...prev, [d.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addQuestToDeliverable(d.id) }}
                        placeholder="Nova quest neste entregável…"
                        style={{
                          flex: 1, background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid transparent',
                          color: 'var(--color-text-primary)',
                          padding: '4px 2px', fontSize: 12,
                          outline: 'none', transition: 'border-color 0.15s',
                        }}
                        onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-light)')}
                        onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                      />
                      <input
                        type="text"
                        autoComplete="off"
                        value={newQuestEstByDeliv[d.id] ?? ''}
                        onChange={e => setNewQuestEstByDeliv(prev => ({ ...prev, [d.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addQuestToDeliverable(d.id) }}
                        placeholder="h:mm"
                        title="Tempo estimado (h:mm, ex: 1:30)"
                        style={{
                          width: 60, background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid transparent',
                          color: 'var(--color-text-primary)',
                          padding: '4px 2px', fontSize: 11,
                          outline: 'none',
                          fontFamily: "'IBM Plex Mono', monospace",
                          transition: 'border-color 0.15s',
                        }}
                        onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-light)')}
                        onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                      />
                      <button
                        onClick={() => addQuestToDeliverable(d.id)}
                        disabled={!(newQuestByDeliv[d.id] ?? '').trim()}
                        style={{
                          background: (newQuestByDeliv[d.id] ?? '').trim() ? 'var(--color-accent-light)' : 'var(--color-bg-tertiary)',
                          color: (newQuestByDeliv[d.id] ?? '').trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                          border: 'none',
                          cursor: (newQuestByDeliv[d.id] ?? '').trim() ? 'pointer' : 'not-allowed',
                          padding: '6px 12px', fontSize: 11, fontWeight: 700,
                          borderRadius: 3,
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Delete deliverable (só se estiver sem quests) */}
                    {delivQuests.length === 0 && (
                      <button
                        onClick={() => handleDeleteDeliverable(d.id)}
                        style={{
                          alignSelf: 'flex-start', marginTop: 6,
                          background: 'none', border: 'none',
                          color: 'var(--color-text-muted)', cursor: 'pointer',
                          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '4px 0',
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                      >
                        deletar entregável
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
          })()}
        </div>
      </div>

      <div style={{ marginTop: 40, paddingTop: 28, borderTop: '1px solid var(--color-divider)' }}>
        <Label>informações detalhadas</Label>
        <div style={{ marginTop: 10 }}>
          <BlockEditor
            value={notesDraft ?? project.notes ?? ''}
            onChange={setNotesDraft}
            placeholder="Digite / pra escolher o tipo de bloco…"
            minHeight={200}
          />
        </div>
      </div>

      {areaQuestCount > 0 && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {areaQuestCount} quest{areaQuestCount !== 1 ? 's' : ''} ativa{areaQuestCount !== 1 ? 's' : ''} neste projeto
        </div>
      )}
    </div>
  )
}

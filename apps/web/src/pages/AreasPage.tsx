import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { Area, Quest, Deliverable } from '../types'
import { createArea, createQuest, deleteQuest, fetchDeliverables, reportApiError } from '../api'
import type { DateRange } from '../utils/dateRange'
import { computeRange, isInRange } from '../utils/dateRange'
import { Label } from '../components/ui/Label'
import { ColorPickerPopover } from '../components/ColorPickerPopover'
import { AreaRow } from '../components/AreaRow'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { QuestRow } from '../components/QuestRow'
import { QuestDetailPanel } from '../components/QuestDetailPanel'
import { PRIORITIES } from '../components/PrioritySelect'

/**
 * `/areas` — lista editável de áreas (create/update/delete). Um clique numa
 * linha navega pra `/areas/:slug` (handled by `AreaDetailRoute`).
 */
export function AreasView({ areas, quests, onAreaCreate, onAreaUpdate, onAreaDelete }: {
  areas: Area[]
  quests: Quest[]
  onAreaCreate: (a: Area) => void
  onAreaUpdate: (slug: string, patch: Partial<Area>) => void
  onAreaDelete: (slug: string) => void
}) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6b7280')
  const [showNewPicker, setShowNewPicker] = useState(false)

  const countBySlug: Record<string, number> = {}
  for (const q of quests) countBySlug[q.area_slug] = (countBySlug[q.area_slug] ?? 0) + 1

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    try {
      const created = await createArea({ name, color: newColor })
      onAreaCreate(created)
      setNewName('')
      setNewColor('#6b7280')
      setCreating(false)
    } catch {
      alert('Erro ao criar área')
    }
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto', color: 'var(--color-text-primary)' }}>
      <header style={{
        display: 'flex', alignItems: 'flex-end', gap: 14,
        paddingBottom: 20, borderBottom: '1px solid var(--color-divider)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--color-text-tertiary)',
            letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
            marginBottom: 4,
          }}>
            Áreas
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
            color: 'var(--color-text-primary)', lineHeight: 1.2,
          }}>
            {areas.length} {areas.length === 1 ? 'área' : 'áreas'} · {quests.length} {quests.length === 1 ? 'quest' : 'quests'}
          </div>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            style={{
              background: 'var(--color-accent-primary)', border: 'none', cursor: 'pointer',
              color: 'var(--color-bg-primary)', fontSize: 11, fontWeight: 700,
              padding: '8px 16px', borderRadius: 3,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-accent-primary)')}
          >
            + nova área
          </button>
        )}
      </header>

      {creating && (
        <section style={{
          marginTop: 32,
          display: 'flex', gap: 14, alignItems: 'center',
          paddingBottom: 18, borderBottom: '1px solid var(--color-divider)',
        }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNewPicker(o => !o)}
              title="Cor da área"
              style={{
                width: 22, height: 22, background: newColor,
                border: '1px solid var(--color-border)', borderRadius: 4,
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
            />
            {showNewPicker && (
              <ColorPickerPopover
                value={newColor}
                onChange={setNewColor}
                onClose={() => setShowNewPicker(false)}
              />
            )}
          </div>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            placeholder="nome da nova área…"
            style={{
              flex: 1, background: 'transparent',
              border: 'none', borderBottom: '2px solid var(--color-border)',
              color: 'var(--color-text-primary)', fontSize: 14, padding: '6px 2px',
              outline: 'none', fontWeight: 500,
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-primary)')}
            onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--color-border)')}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            style={{
              background: newName.trim() ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
              color: newName.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
              border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed',
              fontSize: 10, padding: '8px 14px', borderRadius: 3, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            Criar
          </button>
          <button
            onClick={() => { setCreating(false); setNewName('') }}
            title="Cancelar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 14, padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </section>
      )}

      <section style={{ marginTop: 40 }}>
        <div style={{
          fontSize: 10, color: 'var(--color-text-tertiary)',
          letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
          marginBottom: 14,
        }}>
          Todas as áreas
        </div>
        {areas.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Nenhuma área ainda. Crie uma clicando em "+ nova área" acima.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {areas.map(a => (
              <AreaRow
                key={a.slug}
                area={a}
                questCount={countBySlug[a.slug] ?? 0}
                onOpen={() => navigate(`/areas/${a.slug}`)}
                onUpdate={onAreaUpdate}
                onDelete={onAreaDelete}
              />
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'none' }}><Label>áreas</Label></div>
    </div>
  )
}

/**
 * Wrapper da rota `/areas/:slug`. Lê slug do URL, valida `selectedQuestId`
 * contra a área aberta, renderiza botão "voltar" + `AreaDetailView`.
 */
export function AreaDetailRoute({ areas, quests, selectedQuestId, onSelectQuest, onQuestUpdate, onSessionUpdate, onQuestCreate, onQuestDelete }: {
  areas: Area[]
  quests: Quest[]
  selectedQuestId: string | null
  onSelectQuest: (id: string | null) => void
  onQuestUpdate: (id: string, patch: Partial<Quest>) => void
  onSessionUpdate: () => void
  onQuestCreate: (q: Quest) => void
  onQuestDelete: (id: string) => void
}) {
  const { slug } = useParams<{ slug: string }>()

  if (!slug) return <Navigate to="/areas" replace />

  // Só usa o `selectedQuestId` persistido se ele pertencer a essa área — se
  // for de outra área (stale), ignora sem mexer no state. Assim o F5 dentro
  // de um projeto mantém o painel aberto.
  const validQuestId = selectedQuestId && quests.find(q => q.id === selectedQuestId && q.area_slug === slug)
    ? selectedQuestId
    : null

  return (
    <>
      <Link
        to="/areas"
        onClick={() => onSelectQuest(null)}
        style={{
          background: 'none', border: '1px solid transparent', cursor: 'pointer',
          color: 'var(--color-text-tertiary)', fontSize: 11, marginBottom: 24,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          padding: '6px 8px', borderRadius: 4, transition: 'all 0.2s',
          textDecoration: 'none', display: 'inline-block',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--color-text-primary)'
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--color-text-tertiary)'
          e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        ← voltar
      </Link>
      <AreaDetailView
        key={slug}
        areaSlug={slug}
        areas={areas}
        quests={quests}
        onQuestUpdate={onQuestUpdate}
        selectedQuestId={validQuestId}
        onSelectQuest={onSelectQuest}
        onSessionUpdate={onSessionUpdate}
        onQuestCreate={onQuestCreate}
        onQuestDelete={onQuestDelete}
      />
    </>
  )
}

/**
 * Painel da área individual. Mostra projetos (quests sem parent) com barra de
 * progresso, permite criar projeto inline, abre `QuestDetailPanel` em
 * overlay fullscreen quando um é selecionado.
 */
function AreaDetailView({ areaSlug, areas, quests, onQuestUpdate, selectedQuestId, onSelectQuest, onSessionUpdate, onQuestCreate, onQuestDelete }: {
  areaSlug: string
  areas: Area[]
  quests: Quest[]
  onQuestUpdate: (id: string, patch: Partial<Quest>) => void
  selectedQuestId: string | null
  onSelectQuest: (id: string | null) => void
  onSessionUpdate?: () => void
  onQuestCreate: (q: Quest) => void
  onQuestDelete: (id: string) => void
}) {
  const area = areas.find(a => a.slug === areaSlug)
  const [showDone, setShowDone] = useState(false)
  const [doneRange, setDoneRange] = useState<DateRange>(() => computeRange('7d'))
  const [showCancelled, setShowCancelled] = useState(false)
  const [cancelledRange, setCancelledRange] = useState<DateRange>(() => computeRange('7d'))
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [delivsByProject, setDelivsByProject] = useState<Record<string, Deliverable[]>>({})

  const aqs = quests.filter(q => q.area_slug === areaSlug && !q.parent_id)
  const projectIds = aqs.map(q => q.id).sort().join(',')

  useEffect(() => {
    const ids = projectIds ? projectIds.split(',') : []
    if (ids.length === 0) { setDelivsByProject({}); return }
    let cancelled = false
    Promise.all(ids.map(pid =>
      fetchDeliverables(pid).then(ds => ({ pid, ds })).catch(() => ({ pid, ds: [] as Deliverable[] }))
    )).then(results => {
      if (cancelled) return
      const map: Record<string, Deliverable[]> = {}
      for (const r of results) map[r.pid] = r.ds
      setDelivsByProject(map)
    })
    return () => { cancelled = true }
  }, [projectIds])

  if (!area) return <div style={{ color: 'var(--color-text-tertiary)' }}>Área não encontrada</div>
  const doing = aqs.filter(q => q.status === 'doing').length
  const pending = aqs.filter(q => q.status === 'pending').length
  const done = aqs.filter(q => q.status === 'done').length
  const cancelled = aqs.filter(q => q.status === 'cancelled').length
  // Barra = progresso em relação a tudo já "fechado" (done + cancelled). Se
  // não há nada em andamento, a barra estoura em 100% mesmo quando o que fechou
  // foi por cancelamento.
  const closed = done + cancelled
  const total = aqs.length

  const active = aqs.filter(q => q.status !== 'done' && q.status !== 'cancelled')
  const doneQuestsAll = aqs.filter(q => q.status === 'done')
  const doneQuests = doneQuestsAll.filter(q => isInRange(q.completed_at, doneRange))
  const cancelledQuestsAll = aqs.filter(q => q.status === 'cancelled')
  const cancelledQuests = cancelledQuestsAll.filter(q => isInRange(q.completed_at, cancelledRange))
  const selectedQuest = selectedQuestId ? aqs.find(q => q.id === selectedQuestId) : null

  const handleCreateProject = () => {
    if (!newProjectTitle.trim()) return
    createQuest({
      title: newProjectTitle,
      area_slug: areaSlug,
      parent_id: undefined,
    })
      .then(q => {
        setNewProjectTitle('')
        setCreatingProject(false)
        onQuestCreate(q)
      })
      .catch(err => reportApiError('AreasPage', err))
  }

  const handleDeleteQuest = (questId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este projeto? Todas as quests dentro dele também serão excluídas.')) {
      deleteQuest(questId)
        .then(() => {
          if (selectedQuestId === questId) onSelectQuest(null)
          onQuestDelete(questId)
        })
        .catch(err => reportApiError('AreasPage', err))
    }
  }

  // Detalhe de um projeto substitui a lista inline em vez de abrir como
  // modal flutuante — garante que sidebar e botão "voltar" continuem
  // clicáveis, e evita o loop de z-index que prendia o usuário na página.
  if (selectedQuest) {
    return (
      <QuestDetailPanel
        quest={selectedQuest}
        onClose={() => onSelectQuest(null)}
        onUpdate={onQuestUpdate}
        allQuests={aqs}
        area={area}
        onQuestCreate={onQuestCreate}
        onQuestDelete={onQuestDelete}
      />
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <h2 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, margin: 0 }}>{area.name}</h2>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {total} quest{total !== 1 ? 's' : ''}
          </span>
        </div>
        {area.description && (
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '8px 0 0 0' }}>{area.description}</p>
        )}
        {total > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, display: 'flex', gap: 12, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {doing > 0 && <span>{doing} fazendo</span>}
              {pending > 0 && <span>{pending} pendente{pending !== 1 ? 's' : ''}</span>}
            </div>
            <div style={{ height: 3, background: 'var(--color-border)', borderRadius: 1 }}>
              <div style={{
                height: '100%', borderRadius: 1, background: 'var(--color-accent-light)',
                width: `${Math.round((closed / total) * 100)}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}
      </div>

      {!creatingProject ? (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setCreatingProject(true)}
            style={{
              background: 'var(--color-accent-primary)', border: 'none', cursor: 'pointer',
              color: 'var(--color-bg-primary)', fontSize: 11, fontWeight: 700,
              padding: '8px 16px', borderRadius: 3,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-accent-primary)')}
          >
            + criar projeto
          </button>
        </div>
      ) : (
      <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="text"
          autoFocus
          value={newProjectTitle}
          onChange={e => setNewProjectTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreateProject()
            if (e.key === 'Escape') { setCreatingProject(false); setNewProjectTitle('') }
          }}
          placeholder="título do projeto…"
          style={{
            flex: 1, background: 'transparent',
            border: 'none', borderBottom: '2px solid var(--color-border)',
            color: 'var(--color-text-primary)', padding: '6px 2px', fontSize: 14,
            outline: 'none', fontFamily: "'Satoshi', sans-serif", fontWeight: 500,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--color-accent-primary)')}
          onBlur={e => (e.currentTarget.style.borderBottomColor = 'var(--color-border)')}
        />
        <button
          onClick={handleCreateProject}
          disabled={!newProjectTitle.trim()}
          style={{
            background: newProjectTitle.trim() ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
            color: newProjectTitle.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
            border: 'none', cursor: newProjectTitle.trim() ? 'pointer' : 'not-allowed',
            padding: '8px 14px', fontSize: 10, fontWeight: 700, borderRadius: 3,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          Criar
        </button>
        <button
          onClick={() => { setCreatingProject(false); setNewProjectTitle('') }}
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

      {active.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {active.map(q => (
            <AreaProjectRow
              key={q.id}
              project={q}
              delivs={delivsByProject[q.id] ?? []}
              subtasks={quests.filter(x => x.parent_id === q.id)}
              areaColor={area.color}
              isSelected={selectedQuestId === q.id}
              onOpen={() => onSelectQuest(q.id)}
              onDelete={() => handleDeleteQuest(q.id)}
            />
          ))}
        </div>
      )}

      {doneQuestsAll.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowDone(o => !o)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.15em',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 9 }}>{showDone ? '▼' : '▶'}</span>
              {doneQuests.length} concluída{doneQuests.length !== 1 ? 's' : ''}
            </button>
            <DateRangeFilter value={doneRange} onChange={setDoneRange} />
          </div>
          {showDone && doneQuests.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              Nenhuma concluída no período ({doneQuestsAll.length} no total).
            </div>
          )}
          {showDone && doneQuests.length > 0 && (
            <div style={{ marginTop: 12, opacity: 0.5 }}>
              {doneQuests.map(q => (
                <QuestRow
                  key={q.id}
                  q={q}
                  onUpdate={onQuestUpdate}
                  onClick={() => onSelectQuest(q.id)}
                  isSelected={selectedQuestId === q.id}
                  quests={quests}
                  areas={areas}
                  onSessionUpdate={onSessionUpdate}
                  hideTimer={!q.parent_id}
                  onDelete={handleDeleteQuest}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {cancelledQuestsAll.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowCancelled(o => !o)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.15em',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 9 }}>{showCancelled ? '▼' : '▶'}</span>
              {cancelledQuests.length} cancelada{cancelledQuests.length !== 1 ? 's' : ''}
            </button>
            <DateRangeFilter value={cancelledRange} onChange={setCancelledRange} />
          </div>
          {showCancelled && cancelledQuests.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              Nenhuma cancelada no período ({cancelledQuestsAll.length} no total).
            </div>
          )}
          {showCancelled && cancelledQuests.length > 0 && (
            <div style={{ marginTop: 12, opacity: 0.4 }}>
              {cancelledQuests.map(q => (
                <QuestRow
                  key={q.id}
                  q={q}
                  onUpdate={onQuestUpdate}
                  onClick={() => onSelectQuest(q.id)}
                  isSelected={selectedQuestId === q.id}
                  quests={quests}
                  areas={areas}
                  onSessionUpdate={onSessionUpdate}
                  hideTimer={!q.parent_id}
                  onDelete={handleDeleteQuest}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function fmtMinLabel(m: number): string {
  if (m <= 0) return ''
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h > 0 && r > 0) return `${h}h ${r}m`
  if (h > 0) return `${h}h`
  return `${r}m`
}

function calendarDaysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const deadline = new Date(y, m - 1, d); deadline.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((deadline.getTime() - today.getTime()) / 86400000)
}

function urgencyText(daysAway: number): string {
  if (daysAway < 0) return `atrasado ${Math.abs(daysAway)}d`
  if (daysAway === 0) return 'hoje'
  if (daysAway === 1) return 'amanhã'
  return `em ${daysAway}d`
}

/**
 * Row compacto usado na visão de área — mostra o projeto com metadados úteis
 * (prioridade, deadline, tempo previsto, próximo item a executar, contagem de
 * entregas concluídas) sem precisar abrir o painel de detalhe.
 */
function AreaProjectRow({ project, delivs, subtasks, areaColor, isSelected, onOpen, onDelete }: {
  project: Quest
  delivs: Deliverable[]
  subtasks: Quest[]
  areaColor: string
  isSelected: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const totalEstMin = subtasks.reduce((s, q) => s + (q.estimated_minutes ?? 0), 0)
  const openDelivs = delivs.filter(d => !d.done)
  const doneCount = delivs.length - openDelivs.length
  // API retorna deliverables ordenadas por sort_order. Pega a primeira aberta
  // como "próxima entrega", e a primeira quest não-feita amarrada a ela como
  // "próxima quest".
  const nextDeliv = openDelivs[0] ?? null
  const nextQuest = nextDeliv
    ? subtasks.find(q => q.deliverable_id === nextDeliv.id && q.status !== 'done')
    : subtasks.find(q => q.status !== 'done')

  const priority = PRIORITIES.find(p => p.key === project.priority) ?? PRIORITIES[2]
  const daysAway = project.deadline ? calendarDaysUntil(project.deadline) : null
  const overdue = daysAway !== null && daysAway < 0 && project.status !== 'done'

  return (
    <div
      onClick={onOpen}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer',
        background: isSelected ? 'var(--color-bg-secondary)' : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-primary)' }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', marginTop: 6,
          background: areaColor, flexShrink: 0,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {project.title}
          </div>

          <div style={{
            marginTop: 6,
            display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
            fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
          }}>
            <span style={{
              color: priority.color,
              textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
            }}>
              {priority.label}
            </span>

            {daysAway !== null && (
              <span style={{ color: overdue ? 'var(--color-accent-vivid)' : 'var(--color-text-tertiary)' }}>
                <span style={{ opacity: 0.6, marginRight: 4 }}>deadline</span>
                {urgencyText(daysAway)}
              </span>
            )}

            {totalEstMin > 0 && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                <span style={{ opacity: 0.6, marginRight: 4 }}>previsto</span>
                {fmtMinLabel(totalEstMin)}
              </span>
            )}

            {delivs.length > 0 && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                <span style={{ opacity: 0.6, marginRight: 4 }}>entregas</span>
                {doneCount}/{delivs.length}
              </span>
            )}
          </div>

          {(nextDeliv || nextQuest) && (
            <div style={{
              marginTop: 6,
              fontSize: 11, color: 'var(--color-text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{
                fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-text-muted)', marginRight: 6,
              }}>próximo</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {nextDeliv?.title ?? ''}
                {nextQuest && nextQuest.title !== nextDeliv?.title && (
                  <>
                    {nextDeliv && <span style={{ color: 'var(--color-text-muted)' }}> › </span>}
                    <span style={{ color: 'var(--color-accent-light)' }}>{nextQuest.title}</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Excluir projeto"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: 14, padding: '2px 6px',
            flexShrink: 0, transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-vivid)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          ×
        </button>
      </div>
    </div>
  )
}

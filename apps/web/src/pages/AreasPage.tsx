import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { Area, Project, Quest, Deliverable } from '../types'
import { createArea, createProject, deleteProject, fetchDeliverables, reportApiError } from '../api'
import type { DateRange } from '../utils/dateRange'
import { computeRange, isInRange } from '../utils/dateRange'
import { Label } from '../components/ui/Label'
import { ColorPickerPopover } from '../components/ColorPickerPopover'
import { AreaRow } from '../components/AreaRow'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { QuestDetailPanel } from '../components/QuestDetailPanel'
import { PRIORITIES } from '../components/PrioritySelect'

/**
 * `/areas` — lista editável de áreas. Um clique numa linha navega pra
 * `/areas/:slug` (handled by `AreaDetailRoute`).
 */
export function AreasView({ areas, projects, onAreaCreate, onAreaUpdate, onAreaDelete }: {
  areas: Area[]
  projects: Project[]
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
  for (const p of projects) countBySlug[p.area_slug] = (countBySlug[p.area_slug] ?? 0) + 1

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
            {areas.length} {areas.length === 1 ? 'área' : 'áreas'} · {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
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
 * Wrapper da rota `/areas/:slug`. Lê slug, valida selectedProjectId contra
 * a área aberta, renderiza botão "voltar" + AreaDetailView.
 */
export function AreaDetailRoute({
  areas, projects, quests,
  selectedProjectId, onSelectProject,
  onProjectUpdate, onProjectCreate, onProjectDelete,
  onQuestUpdate, onQuestCreate, onQuestDelete,
  onSessionUpdate,
}: {
  areas: Area[]
  projects: Project[]
  quests: Quest[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  onProjectUpdate: (id: string, patch: Partial<Project>) => void
  onProjectCreate: (p: Project) => void
  onProjectDelete: (id: string) => void
  onQuestUpdate: (id: string, patch: Partial<Quest>) => void
  onQuestCreate: (q: Quest) => void
  onQuestDelete: (id: string) => void
  onSessionUpdate: () => void
}) {
  const { slug } = useParams<{ slug: string }>()

  if (!slug) return <Navigate to="/areas" replace />

  // Só usa o `selectedProjectId` persistido se ele pertencer a essa área.
  const validProjectId = selectedProjectId && projects.find(p => p.id === selectedProjectId && p.area_slug === slug)
    ? selectedProjectId
    : null

  return (
    <>
      <Link
        to="/areas"
        onClick={() => onSelectProject(null)}
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
        projects={projects}
        quests={quests}
        selectedProjectId={validProjectId}
        onSelectProject={onSelectProject}
        onProjectUpdate={onProjectUpdate}
        onProjectCreate={onProjectCreate}
        onProjectDelete={onProjectDelete}
        onQuestUpdate={onQuestUpdate}
        onQuestCreate={onQuestCreate}
        onQuestDelete={onQuestDelete}
        onSessionUpdate={onSessionUpdate}
      />
    </>
  )
}

/**
 * Painel da área individual. Mostra projetos da área com barra de progresso,
 * permite criar projeto inline, abre `QuestDetailPanel` em overlay quando
 * um projeto é selecionado.
 */
function AreaDetailView({
  areaSlug, areas, projects, quests,
  selectedProjectId, onSelectProject,
  onProjectUpdate, onProjectCreate, onProjectDelete,
  onQuestUpdate, onQuestCreate, onQuestDelete,
  onSessionUpdate,
}: {
  areaSlug: string
  areas: Area[]
  projects: Project[]
  quests: Quest[]
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
  onProjectUpdate: (id: string, patch: Partial<Project>) => void
  onProjectCreate: (p: Project) => void
  onProjectDelete: (id: string) => void
  onQuestUpdate: (id: string, patch: Partial<Quest>) => void
  onQuestCreate: (q: Quest) => void
  onQuestDelete: (id: string) => void
  onSessionUpdate: () => void
}) {
  const area = areas.find(a => a.slug === areaSlug)
  const [showDone, setShowDone] = useState(false)
  const [doneRange, setDoneRange] = useState<DateRange>(() => computeRange('7d'))
  const [showCancelled, setShowCancelled] = useState(false)
  const [cancelledRange, setCancelledRange] = useState<DateRange>(() => computeRange('7d'))
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [delivsByProject, setDelivsByProject] = useState<Record<string, Deliverable[]>>({})

  const areaProjects = projects.filter(p => p.area_slug === areaSlug)
  const projectIdsKey = areaProjects.map(p => p.id).sort().join(',')

  useEffect(() => {
    const ids = projectIdsKey ? projectIdsKey.split(',') : []
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
  }, [projectIdsKey])

  if (!area) return <div style={{ color: 'var(--color-text-tertiary)' }}>Área não encontrada</div>
  const doing = areaProjects.filter(p => p.status === 'doing').length
  const pending = areaProjects.filter(p => p.status === 'pending').length
  const done = areaProjects.filter(p => p.status === 'done').length
  const cancelled = areaProjects.filter(p => p.status === 'cancelled').length
  const closed = done + cancelled
  const total = areaProjects.length

  const active = areaProjects.filter(p => p.status !== 'done' && p.status !== 'cancelled')
  const doneAll = areaProjects.filter(p => p.status === 'done')
  const doneInRange = doneAll.filter(p => isInRange(p.completed_at, doneRange))
  const cancelledAll = areaProjects.filter(p => p.status === 'cancelled')
  const cancelledInRange = cancelledAll.filter(p => isInRange(p.completed_at, cancelledRange))
  const selectedProject = selectedProjectId ? areaProjects.find(p => p.id === selectedProjectId) : null

  const handleCreateProject = () => {
    if (!newProjectTitle.trim()) return
    createProject({
      title: newProjectTitle,
      area_slug: areaSlug,
      priority: 'critical',
    })
      .then(p => {
        setNewProjectTitle('')
        setCreatingProject(false)
        onProjectCreate(p)
      })
      .catch(err => reportApiError('AreasPage.createProject', err))
  }

  const handleDeleteProject = (projectId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este projeto? Todos os entregáveis e quests dentro dele também serão excluídos.')) {
      deleteProject(projectId)
        .then(() => {
          if (selectedProjectId === projectId) onSelectProject(null)
          onProjectDelete(projectId)
        })
        .catch(err => reportApiError('AreasPage.deleteProject', err))
    }
  }

  // Painel de detalhe ocupa a tela inteira da área quando um projeto está
  // selecionado (mesma convenção anterior).
  if (selectedProject) {
    return (
      <QuestDetailPanel
        project={selectedProject}
        onClose={() => onSelectProject(null)}
        onProjectUpdate={onProjectUpdate}
        onQuestUpdate={onQuestUpdate}
        area={area}
        quests={quests}
        onQuestCreate={onQuestCreate}
        onQuestDelete={onQuestDelete}
        onSessionUpdate={onSessionUpdate}
      />
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <h2 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, margin: 0 }}>{area.name}</h2>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {total} projeto{total !== 1 ? 's' : ''}
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
          {active.map(p => (
            <AreaProjectRow
              key={p.id}
              project={p}
              delivs={delivsByProject[p.id] ?? []}
              subtasks={quests.filter(q => q.project_id === p.id)}
              areaColor={area.color}
              isSelected={selectedProjectId === p.id}
              onOpen={() => onSelectProject(p.id)}
              onDelete={() => handleDeleteProject(p.id)}
            />
          ))}
        </div>
      )}

      {doneAll.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowDone(o => !o)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.15em',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 9 }}>{showDone ? '▼' : '▶'}</span>
              {doneInRange.length} concluído{doneInRange.length !== 1 ? 's' : ''}
            </button>
            <DateRangeFilter value={doneRange} onChange={setDoneRange} />
          </div>
          {showDone && doneInRange.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              Nenhum concluído no período ({doneAll.length} no total).
            </div>
          )}
          {showDone && doneInRange.length > 0 && (
            <div style={{ marginTop: 12, opacity: 0.5 }}>
              {doneInRange.map(p => (
                <AreaProjectRow
                  key={p.id}
                  project={p}
                  delivs={delivsByProject[p.id] ?? []}
                  subtasks={quests.filter(q => q.project_id === p.id)}
                  areaColor={area.color}
                  isSelected={selectedProjectId === p.id}
                  onOpen={() => onSelectProject(p.id)}
                  onDelete={() => handleDeleteProject(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {cancelledAll.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowCancelled(o => !o)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.15em',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 9 }}>{showCancelled ? '▼' : '▶'}</span>
              {cancelledInRange.length} cancelado{cancelledInRange.length !== 1 ? 's' : ''}
            </button>
            <DateRangeFilter value={cancelledRange} onChange={setCancelledRange} />
          </div>
          {showCancelled && cancelledInRange.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              Nenhum cancelado no período ({cancelledAll.length} no total).
            </div>
          )}
          {showCancelled && cancelledInRange.length > 0 && (
            <div style={{ marginTop: 12, opacity: 0.4 }}>
              {cancelledInRange.map(p => (
                <AreaProjectRow
                  key={p.id}
                  project={p}
                  delivs={delivsByProject[p.id] ?? []}
                  subtasks={quests.filter(q => q.project_id === p.id)}
                  areaColor={area.color}
                  isSelected={selectedProjectId === p.id}
                  onOpen={() => onSelectProject(p.id)}
                  onDelete={() => handleDeleteProject(p.id)}
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
 * Row compacto de um projeto na visão de área — mostra prioridade, deadline,
 * tempo previsto (soma dos child quests), contagem de entregáveis e próximo
 * item a executar.
 */
function AreaProjectRow({ project, delivs, subtasks, areaColor, isSelected, onOpen, onDelete }: {
  project: Project
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

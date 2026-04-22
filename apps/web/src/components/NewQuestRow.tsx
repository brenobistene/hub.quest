import { useEffect, useRef, useState } from 'react'
import type { Area, Deliverable, Quest } from '../types'
import { createQuest, fetchDeliverables } from '../api'

/**
 * Inline "nova quest" composer. Collapsed → "+ nova quest" button. Expanded →
 * título + área (quando `areaSlug='all'`) + projeto + entregável.
 *
 * Regra do novo modelo: toda quest precisa estar amarrada a um projeto E a um
 * entregável. Sem projeto ou sem entregável, o botão "criar" fica desabilitado
 * e a causa é exibida inline (ex: "projeto ainda não tem entregável — crie um
 * no detalhe do projeto primeiro").
 */
export function NewQuestRow({ areaSlug, areas, quests, onCreated }: {
  areaSlug: string
  areas: Area[]
  quests: Quest[]
  onCreated: (q: Quest) => void
  /** @deprecated projeto é sempre obrigatório agora, flag mantida por compat */
  requireProject?: boolean
}) {
  const [active, setActive] = useState(false)
  const [title, setTitle] = useState('')
  const [selectedArea, setSelectedArea] = useState(areaSlug === 'all' ? 'freelas' : areaSlug)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedDeliverable, setSelectedDeliverable] = useState<string | null>(null)
  const [estimatedInput, setEstimatedInput] = useState<string>('')
  const [projectDeliverables, setProjectDeliverables] = useState<Deliverable[]>([])
  const [loadingDelivs, setLoadingDelivs] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  // Parse "30" (min) or "1:30" (h:mm). Devolve undefined quando vazio/inválido.
  function parseTimeToMinutes(input: string): number | undefined {
    if (!input.trim()) return undefined
    if (input.includes(':')) {
      const [h, m] = input.split(':').map(p => parseInt(p.trim(), 10))
      if (!isNaN(h) && !isNaN(m)) return h * 60 + m
      return undefined
    }
    const mins = parseInt(input, 10)
    return isNaN(mins) ? undefined : mins
  }

  useEffect(() => { if (active) ref.current?.focus() }, [active])
  useEffect(() => {
    if (areaSlug !== 'all') setSelectedArea(areaSlug)
    setSelectedProject(null)
    setSelectedDeliverable(null)
  }, [areaSlug])
  useEffect(() => {
    setSelectedProject(null)
    setSelectedDeliverable(null)
  }, [selectedArea])

  // Fetch deliverables when project selected — obrigatório pra decidir se o
  // form pode submeter.
  useEffect(() => {
    if (!selectedProject) { setProjectDeliverables([]); setSelectedDeliverable(null); return }
    let cancelled = false
    setLoadingDelivs(true)
    fetchDeliverables(selectedProject)
      .then(list => {
        if (cancelled) return
        setProjectDeliverables(list)
        // Se só tem um entregável, auto-seleciona pra reduzir fricção.
        if (list.length === 1) setSelectedDeliverable(list[0].id)
        else setSelectedDeliverable(null)
      })
      .catch(() => { if (!cancelled) setProjectDeliverables([]) })
      .finally(() => { if (!cancelled) setLoadingDelivs(false) })
    return () => { cancelled = true }
  }, [selectedProject])

  const projects = quests.filter(q => q.area_slug === selectedArea && !q.parent_id)
  const canCreate = !!title.trim() && !!selectedProject && !!selectedDeliverable

  function commit() {
    const t = title.trim()
    if (!t) { setActive(false); setTitle(''); return }
    if (!selectedProject || !selectedDeliverable) return

    createQuest({
      title: t,
      area_slug: selectedArea,
      parent_id: selectedProject,
      deliverable_id: selectedDeliverable,
      estimated_minutes: parseTimeToMinutes(estimatedInput),
    })
      .then(q => {
        onCreated(q)
        setTitle('')
        setEstimatedInput('')
        setActive(false)
        setSelectedProject(null)
        setSelectedDeliverable(null)
        setProjectDeliverables([])
      })
      .catch((err: any) => {
        alert(err?.detail ?? err?.message ?? 'Erro ao criar quest')
      })
  }

  if (!active) return (
    <button onClick={() => setActive(true)} style={{
      background: 'none', border: '1px solid transparent', cursor: 'pointer',
      color: 'var(--color-border)', fontSize: 12, padding: '12px 0 4px',
      display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
      borderRadius: 4,
    }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--color-accent-light)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--color-border)'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> nova quest
    </button>
  )

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--color-border)' }} />
        <input
          ref={ref}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="título da quest…"
          onKeyDown={e => {
            if (e.key === 'Enter' && canCreate) commit()
            if (e.key === 'Escape') { setActive(false); setTitle('') }
          }}
          onFocus={e => {
            e.currentTarget.style.borderBottomColor = 'var(--color-accent-primary)'
            e.currentTarget.style.boxShadow = '0 2px 0 var(--color-accent-light)'
          }}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-primary)',
            fontSize: 13, fontWeight: 500, outline: 'none', padding: '6px 0',
            transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
            fontFamily: "'Satoshi', sans-serif",
          }}
        />
        <input
          type="text"
          value={estimatedInput}
          onChange={e => setEstimatedInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && canCreate) commit()
            if (e.key === 'Escape') { setActive(false); setTitle('') }
          }}
          placeholder="h:mm"
          title="Tempo estimado (h:mm, ex: 1:30)"
          style={{
            width: 72, background: 'transparent', border: 'none',
            borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-primary)',
            fontSize: 12, outline: 'none', padding: '6px 4px',
            fontFamily: "'IBM Plex Mono', monospace",
            transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
          }}
          onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--color-accent-primary)' }}
          onBlur={e => { e.currentTarget.style.borderBottomColor = 'var(--color-border)' }}
        />
      </div>

      {areaSlug === 'all' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingLeft: 19, flexWrap: 'wrap' }}>
          {areas.map(a => (
            <button
              key={a.slug}
              onClick={() => setSelectedArea(a.slug)}
              style={{
                background: selectedArea === a.slug ? 'var(--color-accent-primary)' : 'transparent',
                border: `1px solid ${selectedArea === a.slug ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                cursor: 'pointer', padding: '5px 10px', fontSize: 10,
                color: selectedArea === a.slug ? 'var(--color-bg-primary)' : 'var(--color-text-tertiary)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                transition: 'all 0.15s', borderRadius: 3, fontWeight: 600,
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Projeto */}
      <div style={{ marginTop: 10, paddingLeft: 19, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
          projeto
        </span>
        {projects.length > 0 ? (
          <select
            value={selectedProject || ''}
            onChange={e => setSelectedProject(e.target.value || null)}
            style={{
              background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: 11, padding: '6px 8px', cursor: 'pointer', outline: 'none',
              borderRadius: 3, fontFamily: "'Satoshi', sans-serif", fontWeight: 500,
            }}
          >
            <option value="">— selecione —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            nenhum projeto nesta área
          </span>
        )}
      </div>

      {/* Entregável (só faz sentido com projeto escolhido) */}
      {selectedProject && (
        <div style={{ marginTop: 10, paddingLeft: 19, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
            entregável
          </span>
          {loadingDelivs ? (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>carregando…</span>
          ) : projectDeliverables.length > 0 ? (
            <select
              value={selectedDeliverable || ''}
              onChange={e => setSelectedDeliverable(e.target.value || null)}
              style={{
                background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 11, padding: '6px 8px', cursor: 'pointer', outline: 'none',
                borderRadius: 3, fontFamily: "'Satoshi', sans-serif", fontWeight: 500,
              }}
            >
              <option value="">— selecione —</option>
              {projectDeliverables.map(d => (
                <option key={d.id} value={d.id}>{d.title}{d.done ? ' (feito)' : ''}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-accent-light)', fontStyle: 'italic' }}>
              este projeto ainda não tem entregável — crie um no detalhe do projeto primeiro
            </span>
          )}
        </div>
      )}

      {/* Criar */}
      <div style={{ marginTop: 12, paddingLeft: 19, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={commit}
          disabled={!canCreate}
          style={{
            background: canCreate ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
            color: canCreate ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
            border: 'none', cursor: canCreate ? 'pointer' : 'not-allowed',
            padding: '7px 14px', fontSize: 11, fontWeight: 700,
            borderRadius: 3, letterSpacing: '0.08em', textTransform: 'uppercase',
            transition: 'all 0.15s',
          }}
        >
          criar
        </button>
        <button
          onClick={() => { setActive(false); setTitle(''); setSelectedProject(null); setSelectedDeliverable(null) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', fontSize: 11, padding: '6px 10px',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          cancelar
        </button>
      </div>
    </div>
  )
}

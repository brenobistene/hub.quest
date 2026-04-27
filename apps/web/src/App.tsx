import { useEffect, useRef, useState } from 'react'
import { Sun, CalendarDays, Target, Layers, AlertTriangle, RotateCcw, Clock, LayoutGrid, ListTodo } from 'lucide-react'
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  fetchQuests, fetchProjects, fetchAreas, fetchProfile, fetchActiveSession,
  patchQuest, patchProject,
  fetchSessions, pauseSession, resumeSession,
  fetchTaskSessions, pauseTaskSession, resumeTaskSession, stopTaskSession,
  fetchRoutineSessions, pauseRoutineSession, resumeRoutineSession, stopRoutineSession,
  reportApiError,
} from './api'
import type { Project, Quest, Area, ActiveSession, Profile } from './types'
import { parseIsoAsUtc, sumClosedSessionsSeconds, formatHMS } from './utils/datetime'
import { SessionHistoryModal } from './components/SessionHistoryModal'
import { DashboardView } from './pages/DashboardPage'
import { DiaView } from './pages/DiaPage'
import { CalendarView } from './pages/CalendarPage'
import { QuestsView } from './pages/QuestsPage'
import { AreasView, AreaDetailRoute } from './pages/AreasPage'
import { RoutinesView } from './pages/RoutinesPage'
import { TasksView } from './pages/TasksPage'
import { MicroDumpView } from './pages/MicroDumpPage'
import { ArquivadosView } from './pages/ArquivadosPage'

const NAV: { path: string; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { path: '/dashboard',   label: 'Dashboard',       Icon: LayoutGrid    },
  { path: '/dia',         label: 'Dia',             Icon: Sun           },
  { path: '/calendario',  label: 'Calendário',      Icon: CalendarDays  },
  { path: '/quests',      label: 'Quests',          Icon: Target        },
  { path: '/areas',       label: 'Áreas',           Icon: Layers        },
  { path: '/rotinas',     label: 'Rotinas',         Icon: RotateCcw     },
  { path: '/tarefas',     label: 'Tarefas',         Icon: ListTodo      },
  { path: '/micro-dump',  label: 'Dump',            Icon: Clock         },
  { path: '/arquivados',  label: 'Arquivados',      Icon: AlertTriangle },
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [projects, setProjects] = useState<Project[]>([])
  const [quests, setQuests] = useState<Quest[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [profile, setProfile] = useState<Profile>({ name: '', role: '', avatar_url: '' })
  const [archivedIdeas, setArchivedIdeas] = useState<Array<{ id: string; title: string; created_at: string }>>(() => {
    try {
      const saved = localStorage.getItem('hq-archived-ideas')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(() => {
    try {
      const nav = JSON.parse(localStorage.getItem('hq-navigation') || '{}')
      return nav.questId || null
    } catch {
      return localStorage.getItem('hq-selectedQuestId')
    }
  })
  // Qual projeto está com o painel de detalhe aberto. Substitui o uso antigo
  // de selectedQuestId pra "selecionar um projeto" (quando projeto era quest).
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    try {
      const nav = JSON.parse(localStorage.getItem('hq-navigation') || '{}')
      return nav.projectId || null
    } catch {
      return null
    }
  })
  const [sessionUpdateTrigger, setSessionUpdateTrigger] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('hq-sidebar-collapsed')
    return saved ? JSON.parse(saved) : false
  })
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [bannerTimer, setBannerTimer] = useState(0)
  const [bannerClosedSec, setBannerClosedSec] = useState(0)
  const [isHydrated, setIsHydrated] = useState(false)
  const [bannerHistoryOpen, setBannerHistoryOpen] = useState(false)
  const [bannerHistorySessions, setBannerHistorySessions] = useState<{ started_at: string; ended_at: string | null }[]>([])

  // Which entity the user has "in focus" right now. Persisted so a reload
  // keeps the banner showing a paused session until the user finalizes it.
  const focusedEntityRef = useRef<{ type: string; id: string } | null>((() => {
    try {
      const saved = localStorage.getItem('hq-focused-entity')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })())

  function saveFocusedEntity(f: { type: string; id: string } | null) {
    focusedEntityRef.current = f
    try {
      if (f) localStorage.setItem('hq-focused-entity', JSON.stringify(f))
      else localStorage.removeItem('hq-focused-entity')
    } catch {}
  }

  function refreshActiveSession() {
    fetchActiveSession(focusedEntityRef.current).then(resp => {
      setActiveSession(resp)
      if (resp) saveFocusedEntity({ type: resp.type, id: resp.id })
      else saveFocusedEntity(null)
    }).catch(err => reportApiError('App', err))
  }
  const bannerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bannerSyncRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onSessionUpdate = () => {
    setSessionUpdateTrigger(prev => prev + 1)
  }

  // Mark as hydrated and fetch active session on mount
  useEffect(() => {
    setIsHydrated(true)
    refreshActiveSession()
  }, [])

  // Fetch active session + refresh quests/projects when update is triggered
  useEffect(() => {
    refreshActiveSession()
    fetchQuests().then(setQuests).catch(err => reportApiError('App', err))
    fetchProjects().then(setProjects).catch(err => reportApiError('App', err))
  }, [sessionUpdateTrigger])

  // Mantém o banner sincronizado com a sessão ativa do backend.
  //
  // Polling custa ~1 request a cada 15s, mas a gente pausa totalmente quando
  // a aba está em segundo plano (visibilityState === 'hidden') — zero carga
  // enquanto o usuário não está olhando. Quando volta, faz um refresh imediato
  // e reinicia o intervalo, pra o banner refletir o estado real caso tenha
  // mudado fora (ex: outra aba clicou Play/Pause).
  useEffect(() => {
    const POLL_MS = 15_000
    const start = () => {
      if (bannerSyncRef.current) return
      bannerSyncRef.current = setInterval(refreshActiveSession, POLL_MS)
    }
    const stop = () => {
      if (bannerSyncRef.current) {
        clearInterval(bannerSyncRef.current)
        bannerSyncRef.current = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshActiveSession()
        start()
      } else {
        stop()
      }
    }
    // Arranca no estado atual da aba.
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Defesa em profundidade: se o state global de quests indica que a entity
  // do banner está done, limpa o banner imediatamente (sem esperar o polling
  // de 15s). Cobre o caso onde algum lugar marca a quest done sem chamar
  // onSessionUpdate (ex: edit inline em outra tela).
  useEffect(() => {
    if (!activeSession || activeSession.type !== 'quest') return
    const q = quests.find(x => x.id === activeSession.id)
    if (q && q.status === 'done') {
      setActiveSession(null)
      saveFocusedEntity(null)
    }
  }, [quests, activeSession?.type, activeSession?.id])

  // Refresh defensivo da sessão ativa ao trocar de rota. Como tasks/routines
  // não estão no state global do App (cada page busca por conta), não dá pra
  // validar via state como nas quests acima — esse refresh garante que ao
  // navegar pra outra tela o banner reflita o estado atual do backend.
  useEffect(() => {
    if (document.visibilityState === 'visible') refreshActiveSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Tracks which (type, id) pair the current bannerClosedSec value corresponds
  // to. Used to avoid mixing stale session data from a previous entity into
  // the banner during async refetches (was causing the timer to jump
  // backwards when switching tasks).
  const bannerClosedSecForRef = useRef<string | null>(null)

  // Accumulated closed-session time for the active entity — shown as the big
  // total in the banner alongside the current session timer. Refetches on
  // entity change and whenever a session update is triggered (pause/resume
  // closes/opens sessions, so this needs to re-sum).
  useEffect(() => {
    if (!activeSession) {
      bannerClosedSecForRef.current = null
      setBannerClosedSec(0)
      return
    }
    const { type, id } = activeSession
    const key = `${type}:${id}`
    // Reset imediato quando o entity muda — evita "tempo pulando pra trás"
    // ao trocar de task, enquanto a fetch ainda não voltou.
    if (bannerClosedSecForRef.current !== key) {
      bannerClosedSecForRef.current = key
      setBannerClosedSec(0)
    }
    const loader = type === 'quest'
      ? fetchSessions(id)
      : type === 'task'
        ? fetchTaskSessions(id)
        : fetchRoutineSessions(id)
    let cancelled = false
    loader
      .then(list => {
        if (cancelled) return
        const safe = (Array.isArray(list) ? list : []).map((s: any) => ({
          started_at: s?.started_at ?? '',
          ended_at: s?.ended_at ?? null,
        }))
        setBannerClosedSec(sumClosedSessionsSeconds(safe))
      })
      .catch(() => { if (!cancelled) setBannerClosedSec(0) })
    return () => { cancelled = true }
  }, [activeSession?.type, activeSession?.id, sessionUpdateTrigger])

  // Timer for banner elapsed time
  useEffect(() => {
    if (!activeSession) return

    const updateTimer = () => {
      const start = parseIsoAsUtc(activeSession.started_at).getTime()
      let elapsed = 0

      if (isNaN(start)) {
        setBannerTimer(0)
        return
      }

      if (activeSession.is_active) {
        elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000))
      } else if (activeSession.ended_at) {
        const end = parseIsoAsUtc(activeSession.ended_at).getTime()
        if (!isNaN(end)) elapsed = Math.max(0, Math.floor((end - start) / 1000))
      }

      setBannerTimer(elapsed)
    }

    updateTimer()
    // Only update timer if session is active, otherwise keep the frozen time
    if (activeSession.is_active) {
      bannerTimerRef.current = setInterval(updateTimer, 100)
    }

    return () => {
      if (bannerTimerRef.current) clearInterval(bannerTimerRef.current)
    }
  }, [activeSession])

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('hq-sidebar-collapsed', JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  // URL is now the source of truth for surface (via React Router).
  // We still persist selected quest id so drilling back into an area restores it.
  useEffect(() => {
    const nav = { questId: selectedQuestId || null }
    localStorage.setItem('hq-navigation', JSON.stringify(nav))
  }, [selectedQuestId])

  // Persist archived ideas
  useEffect(() => {
    localStorage.setItem('hq-archived-ideas', JSON.stringify(archivedIdeas))
  }, [archivedIdeas])

  useEffect(() => {
    fetchQuests().then(setQuests).catch(err => reportApiError('App', err))
    fetchProjects().then(setProjects).catch(err => reportApiError('App', err))
    fetchAreas().then(setAreas).catch(err => reportApiError('App', err))
    fetchProfile().then(setProfile).catch(err => reportApiError('App', err))

    // Inject CSS animations
    const style = document.createElement('style')
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  // Refetch quests+projects when entering /quests (URL-driven)
  useEffect(() => {
    if (location.pathname.startsWith('/quests')) {
      fetchQuests().then(setQuests).catch(err => reportApiError('App', err))
      fetchProjects().then(setProjects).catch(err => reportApiError('App', err))
    }
  }, [location.pathname])

  // ESC: go back one level (area detail → areas list → /dia)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      const path = location.pathname
      const match = path.match(/^\/areas\/(.+)/)
      if (match) {
        setSelectedQuestId(null)
        navigate('/areas')
      } else if (path !== '/dia') {
        navigate('/dia')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, right: 'auto',
        width: sidebarCollapsed ? 70 : 210, flexShrink: 0, borderRight: '1px solid var(--color-border)',
        padding: '32px 0', display: 'flex', flexDirection: 'column', gap: 1,
        background: 'var(--color-bg-primary)', transition: 'width 0.3s',
        height: '100vh', overflowY: 'auto', zIndex: 100,
        boxSizing: 'border-box',
      }}>
        {/* Logo */}
        <div style={{
          padding: sidebarCollapsed ? '0 12px 32px' : '0 16px 32px',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          transition: 'padding 0.3s',
          marginBottom: 24,
        }}>
          <img src="/hub-quest-mark.svg" alt="Hub Quest" style={{ width: 36, height: 36, opacity: 0.9 }} />
          {!sidebarCollapsed && (
            <span style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 700 }}>
              HUB QUEST
            </span>
          )}
        </div>

        {NAV.map(n => (
          <NavLink
            key={n.path}
            to={n.path}
            title={sidebarCollapsed ? n.label : undefined}
            style={({ isActive }) => ({
              background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
              border: 'none', cursor: 'pointer',
              textAlign: 'left', padding: sidebarCollapsed ? '12px 14px' : '10px 16px',
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              borderLeft: isActive ? '3px solid var(--color-accent-primary)' : '3px solid transparent',
              transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
              display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10,
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              letterSpacing: '0.02em',
              textDecoration: 'none',
            })}
          >
            {({ isActive }) => (
              <>
                <n.Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} />
                {!sidebarCollapsed && n.label}
              </>
            )}
          </NavLink>
        ))}

        {/* Collapse button - Fixed at bottom of page */}
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{
          position: 'fixed', bottom: 0, left: 0,
          width: sidebarCollapsed ? 70 : 210,
          background: 'var(--color-accent-primary)',
          border: 'none', cursor: 'pointer',
          color: 'var(--color-bg-primary)', padding: '14px',
          fontSize: 14, fontWeight: 700, letterSpacing: '0.05em',
          transition: 'all 0.3s cubic-bezier(0.3, 0, 0.7, 1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderTop: `1px solid var(--color-border)`,
          zIndex: 101,
        }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.9'
            e.currentTarget.style.background = 'var(--color-accent-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.background = 'var(--color-accent-primary)'
          }}
          title={sidebarCollapsed ? "Expandir menu ←" : "Recolher menu →"}
        >
          {sidebarCollapsed ? '←' : '→'}
        </button>
      </aside>

      {isHydrated && activeSession && (
        <div style={{
          position: 'fixed', top: 0, left: sidebarCollapsed ? 70 : 210, right: 0,
          height: 80, background: 'linear-gradient(to bottom, var(--color-bg-tertiary), var(--color-bg-secondary))',
          borderBottom: `1px solid ${activeSession.is_active ? 'var(--color-accent-primary)' : 'var(--color-success)'}`,
          boxShadow: `inset 0 1px 0 rgba(139, 46, 46, 0.2), 0 4px 12px rgba(0, 0, 0, 0.5)`,
          display: 'flex', alignItems: 'center', gap: 24, padding: '0 32px',
          transition: 'all 0.3s', zIndex: 99,
        }}>

          {/* Session info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              color: activeSession.is_active ? 'var(--color-accent-light)' : 'var(--color-success)',
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span>{activeSession.is_active ? 'EM EXECUÇÃO' : 'PAUSADO'}</span>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 2,
                background: 'var(--color-bg-primary)', color: 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border)',
              }}>
                {activeSession.type === 'task' ? 'TAREFA' : activeSession.type === 'routine' ? 'ROTINA' : 'QUEST'}
              </span>
            </div>
            <div style={{ fontSize: 16, color: 'var(--color-text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeSession.title}
            </div>
            {(activeSession.parent_title || activeSession.deliverable_title) && (
              <div style={{
                marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)',
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                letterSpacing: '0.02em',
              }}>
                {activeSession.parent_title && <span>{activeSession.parent_title}</span>}
                {activeSession.parent_title && activeSession.deliverable_title && (
                  <span style={{ color: 'var(--color-text-muted)' }}>›</span>
                )}
                {activeSession.deliverable_title && (
                  <span style={{ color: 'var(--color-accent-light)' }}>{activeSession.deliverable_title}</span>
                )}
              </div>
            )}
          </div>

          {/* Timer (clickable to show full history). Big number is the
              accumulated total across all sessions for this entity; the
              smaller row below shows just the current sitting. */}
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div
              onClick={async () => {
                if (!activeSession) return
                try {
                  const loader = activeSession.type === 'quest'
                    ? fetchSessions(activeSession.id)
                    : activeSession.type === 'task'
                      ? fetchTaskSessions(activeSession.id)
                      : fetchRoutineSessions(activeSession.id)
                  const list = await loader
                  setBannerHistorySessions(
                    (list as any[]).map(s => ({
                      started_at: s?.started_at ?? '',
                      ended_at: s?.ended_at ?? null,
                    }))
                  )
                  setBannerHistoryOpen(true)
                } catch {
                  setBannerHistorySessions([])
                  setBannerHistoryOpen(true)
                }
              }}
              title="ver histórico"
              style={{
                cursor: 'pointer',
                transition: 'opacity 0.15s',
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <div style={{
                fontSize: 24, fontWeight: 700,
                color: activeSession.is_active ? 'var(--color-accent-vivid)' : 'var(--color-success-light)',
                fontFamily: "'IBM Plex Mono', monospace",
                lineHeight: 1,
              }}>
                {formatHMS(bannerTimer)}
              </div>
              {bannerClosedSec > 0 && (() => {
                const mins = Math.round(bannerClosedSec / 60)
                const h = Math.floor(mins / 60)
                const m = mins % 60
                const label = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`
                return (
                  <div style={{
                    fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: '0.05em',
                  }}>
                    anterior {label}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                if (!activeSession) return
                const { type, id, is_active } = activeSession
                const call = is_active
                  ? (type === 'quest' ? pauseSession(id) : type === 'task' ? pauseTaskSession(id) : pauseRoutineSession(id))
                  : (type === 'quest' ? resumeSession(id) : type === 'task' ? resumeTaskSession(id) : resumeRoutineSession(id))
                call.then(() => onSessionUpdate()).catch(err => reportApiError('App', err))
              }}
              style={{
                background: activeSession.is_active ? 'var(--color-accent-primary)' : 'var(--color-success)',
                border: 'none', cursor: 'pointer',
                color: 'var(--color-bg-primary)', padding: '10px 18px', fontSize: 11,
                borderRadius: 4, fontWeight: 700, transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
              title={activeSession.is_active ? `Pausar ${activeSession.type}` : `Retomar ${activeSession.type}`}
            >
              {activeSession.is_active ? 'PAUSAR' : 'RETOMAR'}
            </button>

            <button
              onClick={() => {
                if (!activeSession) return
                const { type, id, is_active } = activeSession

                const finalizeQuest = () => {
                  patchQuest(id, { status: 'done' }).catch(err => reportApiError('App', err))
                  setQuests(qs => qs.map(q => q.id === id ? { ...q, status: 'done' } : q))
                  setActiveSession(null)
                  saveFocusedEntity(null)
                  onSessionUpdate()
                }

                if (type === 'quest') {
                  if (is_active) {
                    pauseSession(id).then(finalizeQuest).catch(err => reportApiError('App', err))
                  } else {
                    finalizeQuest()
                  }
                } else if (type === 'task') {
                  stopTaskSession(id).then(() => {
                    setActiveSession(null)
                    onSessionUpdate()
                  }).catch(err => reportApiError('App', err))
                } else if (type === 'routine') {
                  stopRoutineSession(id).then(() => {
                    setActiveSession(null)
                    onSessionUpdate()
                  }).catch(err => reportApiError('App', err))
                }
              }}
              style={{
                background: 'var(--color-success)', border: 'none', cursor: 'pointer',
                color: 'var(--color-bg-primary)', padding: '10px 18px', fontSize: 11,
                borderRadius: 4, fontWeight: 700, transition: 'all 0.2s cubic-bezier(0.3, 0, 0.7, 1)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
              title={`Finalizar ${activeSession.type}`}
            >
              FINALIZAR
            </button>
          </div>
        </div>
      )}

      {bannerHistoryOpen && (
        <SessionHistoryModal
          sessions={bannerHistorySessions}
          onClose={() => setBannerHistoryOpen(false)}
        />
      )}

      <main style={{
        flex: 1, padding: location.pathname.startsWith('/calendario') ? '24px 32px' : '48px 60px', maxWidth: '100%',
        marginLeft: sidebarCollapsed ? 70 : 210, marginTop: (isHydrated && activeSession) ? 80 : 0,
        transition: 'margin-top 0.3s, margin-left 0.3s',
        minHeight: '100vh',
        background: 'var(--color-bg-primary)',
      }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dia" replace />} />
          <Route path="/dashboard" element={<DashboardView projects={projects} quests={quests} areas={areas} profile={profile} onProfileUpdate={setProfile} onSelectProject={setSelectedProjectId} />} />
          <Route path="/dia" element={<DiaView projects={projects} quests={quests} areas={areas} activeSession={activeSession} onSessionUpdate={onSessionUpdate} onSelectProject={setSelectedProjectId} />} />
          <Route path="/calendario" element={<CalendarView projects={projects} quests={quests} areas={areas} sessionUpdateTrigger={sessionUpdateTrigger} />} />
          <Route path="/quests" element={<QuestsView projects={projects} quests={quests} areas={areas} onSessionUpdate={onSessionUpdate} sessionUpdateTrigger={sessionUpdateTrigger} onQuestUpdate={(id, patch) => {
            setQuests(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q))
            patchQuest(id, patch).catch(err => reportApiError('App', err))
          }} />} />
          <Route path="/rotinas" element={<RoutinesView />} />
          <Route path="/tarefas" element={<TasksView activeSession={activeSession} onSessionUpdate={onSessionUpdate} sessionUpdateTrigger={sessionUpdateTrigger} />} />
          <Route path="/micro-dump" element={<MicroDumpView areas={areas} projects={projects} onArchive={(idea) => setArchivedIdeas([...archivedIdeas, idea])} />} />
          <Route path="/arquivados" element={<ArquivadosView archivedIdeas={archivedIdeas} onDelete={(id) => setArchivedIdeas(prev => prev.filter(i => i.id !== id))} />} />
          <Route path="/areas" element={
            <AreasView
              areas={areas}
              projects={projects}
              onAreaCreate={(a) => setAreas(prev => [...prev, a])}
              onAreaUpdate={(slug, patch) => setAreas(prev => prev.map(x => x.slug === slug ? { ...x, ...patch } : x))}
              onAreaDelete={(slug) => setAreas(prev => prev.filter(x => x.slug !== slug))}
            />
          } />
          <Route path="/areas/:slug" element={
            <AreaDetailRoute
              areas={areas}
              projects={projects}
              quests={quests}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onProjectUpdate={(id, patch) => {
                setProjects(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p))
                patchProject(id, patch)
                  .then(() => {
                    // Arquivar/desarquivar um projeto muda quais quests o
                    // backend devolve em /api/quests (filtra por archived_at
                    // do projeto pai). Refetch pra o state global sair de
                    // sincronia ou continuar sincronizado sem F5.
                    if ('archived_at' in patch) {
                      fetchQuests().then(setQuests).catch(err => reportApiError('App', err))
                    }
                  })
                  .catch(err => reportApiError('App', err))
              }}
              onQuestUpdate={(id, patch) => {
                setQuests(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q))
                patchQuest(id, patch).catch(err => reportApiError('App', err))
              }}
              onSessionUpdate={onSessionUpdate}
              onProjectCreate={(p) => setProjects(ps => [p, ...ps])}
              onProjectDelete={(id) => setProjects(ps => ps.filter(p => p.id !== id))}
              onQuestCreate={(q) => setQuests(qs => [q, ...qs])}
              onQuestDelete={(id) => setQuests(qs => qs.filter(q => q.id !== id))}
            />
          } />
          <Route path="*" element={<Navigate to="/dia" replace />} />
        </Routes>
      </main>
    </div>
  )
}


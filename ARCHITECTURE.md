# Hub Quest — Arquitetura

Documento vivo que descreve a estrutura do projeto. **Leia antes de mexer em código** e **atualize sempre que mudar algo estrutural** (novo arquivo, nova página, nova entidade, mudança de contrato de API, etc).

Última atualização: 2026-04-20 (Fase 3 em progresso — Blocos 1, 2 e 3 concluídos).

---

## 1. Visão geral

**Hub Quest** é um app pessoal single-user de produtividade — organiza quests, tarefas, rotinas e ideias soltas por áreas de vida.

**Stack:**
- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind 4 + **React Router 7** (inline styles predominam — pouco uso de classes Tailwind)
- **Backend:** FastAPI (Python) + SQLite local
- **Execução:** tudo local na máquina do usuário. Sem deploy. Sem autenticação.

**Portas de dev:**
- Backend: `http://127.0.0.1:8001`
- Frontend (Vite): `http://localhost:5174`

---

## 2. Estrutura de diretórios

```
hub.quest/
├── ARCHITECTURE.md          ← este arquivo
├── hubquest_handoff.md      ← histórico da migração do PC pessoal
└── apps/
    ├── api/                 (backend)
    │   ├── main.py          ← TODOS os endpoints FastAPI (~1720 linhas)
    │   ├── db.py            ← schema SQLite + init_db() + seed de áreas
    │   ├── calendar_service.py  ← integração Google Calendar (DESATIVADA)
    │   ├── create_hub_calendar.py
    │   ├── hubquest.db      ← SQLite (não commitado)
    │   ├── requirements.txt
    │   └── .env             ← GOOGLE_CALENDAR_ENABLED=false (não commitado)
    └── web/                 (frontend)
        ├── src/
        │   ├── main.tsx     ← bootstrap React + BrowserRouter
        │   ├── App.tsx      ← layout raiz, sidebar, banner, <Routes> (~9400 linhas; Fase 3 em progresso)
        │   ├── api.ts       ← todas as chamadas HTTP (fetchQuests, etc)
        │   ├── types.ts     ← tipos compartilhados (Quest, Task, Area, etc)
        │   ├── index.css    ← CSS global + variáveis de design
        │   ├── utils/       ← helpers puros (Fase 3 — Bloco 1)
        │   │   ├── datetime.ts     ← parseIsoAsUtc, startOfLocalDay, endOfLocalDay, isoToLocalYmd, sumClosedSessionsSeconds, formatHMS
        │   │   ├── dateRange.ts    ← DatePreset, DateRange, computeRange, isInRange, rangeLabel, DATE_PRESET_LABELS
        │   │   ├── dayPeriods.ts   ← DayPeriods, DEFAULT_DAY_PERIODS, loadDayPeriods, saveDayPeriods, periodRangesMinFrom, minutesToHHMM, hhmmToMinutes
        │   │   ├── blocks.ts       ← UnproductiveBlock, BlockRange, blockOccursOnDate, getBlockRangesForDay, getAllBlockRangesForDay
        │   │   └── phrases.ts      ← DEFAULT_PHRASES, loadPhrases, savePhrases
        │   ├── components/
        │   │   ├── ui/                      ← átomos (Fase 3 — Bloco 2)
        │   │   │   ├── Label.tsx            ← label pequeno uppercase (seções, campos)
        │   │   │   ├── Section.tsx          ← bloco com título + ícone + borda inferior
        │   │   │   └── InlineText.tsx       ← input Notion-style (Enter commita, Esc cancela)
        │   │   ├── SessionHistoryModal.tsx  ← modal com lista de sessões + tempo total
        │   │   ├── ProfileEditModal.tsx     ← editar nome/cargo/avatar do Dashboard
        │   │   ├── DayPeriodsEditModal.tsx  ← ajustar cortes de manhã/tarde/noite
        │   │   └── ColorPickerPopover.tsx   ← paleta 12 cores + hex custom (AREA_COLOR_PALETTE)
        │   ├── pages/       ← (vazia por enquanto, Fase 3 — Bloco 5)
        │   └── assets/
        ├── public/
        │   ├── breno-perfil.jpg
        │   ├── hub-quest-mark.svg
        │   └── ...
        └── package.json
```

**Observação sobre `App.tsx`:** hoje é monolítico por decisão prévia. Documento seção 6 ("Componentes do App.tsx") lista **qual função está em qual linha** pra facilitar Ctrl+G. A fase 2/3 do plano de refatoração vai fragmentar em `pages/` e `components/`.

---

## 3. Domínio — entidades

Cada entidade mapeia um conceito real da vida do usuário. **Não misturar** — cada uma tem semântica e UI próprias.

| Entidade | Mesa SQLite | Descrição |
|---|---|---|
| **Area** | `areas` | 5 áreas fixas de vida (Freelas, Faculdade, Growth, Trabalho, Health). Editável via UI. |
| **Quest** | `quests` | Tarefa significativa. Pode ser projeto (sem `parent_id`) ou subtarefa (com `parent_id`). Tem área obrigatória, prioridade, deadline, status, sessions de tempo. |
| **Deliverable** | `deliverables` | Entrega concreta dentro de um projeto pai (ex: cada vídeo de um edit). |
| **Routine** | `routines` | Hábito recorrente (`daily` / `weekdays` / `weekly` / `monthly`). Feita por **dia** — marcada via `routine_logs`. |
| **Task** | `tasks` | Tarefa pontual com campos opcionais: data agendada, horário (start+end), duração. Sem área, sem recorrência. |
| **MicroTask** | `micro_tasks` | Ideia rápida, só título. Ponto de entrada (inbox) — depois é convertida em Tarefa/Quest/Rotina ou arquivada. |
| **ArchivedIdea** | localStorage (`hq-archived-ideas`) | Ideia descartada temporariamente. Não vai pro banco. |

**Sessões de tempo** (cronômetro com play/pause/resume/stop):
- `quest_sessions` — vinculada a uma quest
- `task_sessions` — vinculada a uma tarefa
- `routine_sessions` — vinculada a uma rotina **+ data** (uma série de sessões por dia)

Regra global: **apenas UMA sessão ativa por vez** em todo o sistema. Backend reforça com HTTP 409 no start/resume se outra está rodando.

**UserProfile** (tabela `user_profile`, linha única id=1): name, role, avatar_url. Editável no Dashboard.

---

## 4. Backend — endpoints

Todos em [apps/api/main.py](apps/api/main.py). Organizados por seções com comentário `# ─── X ───`.

### Health
- `GET /api/health`

### Areas
- `GET /api/areas`
- `POST /api/areas`
- `PATCH /api/areas/{slug}`
- `DELETE /api/areas/{slug}` → 409 se tem quests vinculadas

### Profile
- `GET /api/profile`
- `PATCH /api/profile`

### Quests
- `GET /api/quests?area=&status=&parent_id=` → retorna também `worked_minutes` (soma de sessões fechadas, independente de status)
- `POST /api/quests`
- `PATCH /api/quests/{quest_id}` → seta `completed_at` em transição para `done`
- `DELETE /api/quests/{quest_id}`
- `POST /api/quests/reorder` body: `{quest_ids: string[]}`

### Quest Sessions
- `GET /api/quests/{quest_id}/sessions`
- `POST /api/quests/{quest_id}/sessions/start` → 409 se há outra ativa
- `POST /api/quests/{quest_id}/sessions/pause`
- `POST /api/quests/{quest_id}/sessions/resume` → 409 se há outra ativa

### Deliverables
- `GET /api/quests/{quest_id}/deliverables`
- `POST /api/quests/{quest_id}/deliverables`
- `PATCH /api/deliverables/{deliv_id}`
- `DELETE /api/deliverables/{deliv_id}`
- `POST /api/quests/{quest_id}/deliverables/reorder`

### Tasks
- `GET /api/tasks?done=&date=YYYY-MM-DD`
- `POST /api/tasks`
- `PATCH /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`
- `POST /api/tasks/{task_id}/toggle`

### Task Sessions
- `GET /api/tasks/{task_id}/sessions`
- `POST /api/tasks/{task_id}/sessions/start`
- `POST /api/tasks/{task_id}/sessions/pause`
- `POST /api/tasks/{task_id}/sessions/resume`
- `POST /api/tasks/{task_id}/sessions/stop` → fecha sessão + marca `done=1` + `completed_at`

### Routines
- `GET /api/routines?target=YYYY-MM-DD` → filtra por dia e preenche `done` via `routine_logs`
- `GET /api/routines/all` → lista sem filtro de data
- `POST /api/routines`
- `PATCH /api/routines/{routine_id}`
- `DELETE /api/routines/{routine_id}`
- `POST /api/routines/{routine_id}/toggle?target=` → alterna log daquele dia
- `GET /api/routines/completion-stats?from=&to=` → estatísticas agregadas

### Routine Sessions
- `GET /api/routines/{routine_id}/sessions?target=`
- `POST /api/routines/{routine_id}/sessions/start?target=`
- `POST /api/routines/{routine_id}/sessions/pause?target=`
- `POST /api/routines/{routine_id}/sessions/resume?target=`
- `POST /api/routines/{routine_id}/sessions/stop?target=` → fecha sessão + cria `routine_log` do dia

### Global Sessions
- `GET /api/sessions/active?focused_type=&focused_id=`
  - Retorna a sessão **rodando** (prioridade) **ou** a última sessão pausada da entidade "em foco" (caller informa). Se nada, retorna `null`.

### Micro Tasks
- `GET /api/micro-tasks`
- `POST /api/micro-tasks`
- `DELETE /api/micro-tasks/{micro_id}`

### Google Calendar (desativado)
- `POST /api/calendar/create-event`
- `POST /api/calendar/update-event`
- `DELETE /api/calendar/delete-event`
- Respondem `{"status": "skipped"}` enquanto `GOOGLE_CALENDAR_ENABLED=false`.

### Timestamps — convenção
Todos os campos `*_at` (started_at, ended_at, completed_at, updated_at, created_at) **devem ser gravados com `Z`** no final (UTC explícito) via helper `_utcnow_iso_z()`.

O helper `_parse_iso(str)` tolera timestamps com ou sem `Z` (legado) e normaliza pra UTC. Use ele em todo cálculo de datetime.

---

## 5. Schema SQLite

Definido em [apps/api/db.py](apps/api/db.py) dentro de `init_db()`. Apenas **áreas** têm seed automático — quests/rotinas/tarefas são criadas exclusivamente pelo usuário.

Resumo das tabelas:

```
areas(id, slug UNIQUE, name, description, sort_order, color)

quests(id, parent_id→quests, title, area_slug→areas, status, priority,
       deadline, estimated_minutes, next_action, notes, sort_order,
       deliverable_id→deliverables, completed_at, calendar_event_id,
       created_at, updated_at)

subtasks(id AUTO, quest_id→quests, title, done, sort_order)
  (tabela existe mas UI usa quests com parent_id no lugar)

routines(id, title, recurrence, day_of_week, days_of_week, day_of_month,
         start_time, end_time, estimated_minutes, calendar_event_id,
         created_at)

routine_logs(id AUTO, routine_id→routines, completed_date,
             UNIQUE(routine_id, completed_date))

quest_sessions(id AUTO, quest_id→quests, session_num, started_at, ended_at,
               UNIQUE(quest_id, session_num))

task_sessions(id AUTO, task_id→tasks, session_num, started_at, ended_at,
              UNIQUE(task_id, session_num))

routine_sessions(id AUTO, routine_id→routines, date, session_num,
                 started_at, ended_at,
                 UNIQUE(routine_id, date, session_num))

deliverables(id, quest_id→quests, title, done, sort_order,
             estimated_minutes, minutes_worked)

tasks(id, title, scheduled_date, start_time, end_time, duration_minutes,
      done, completed_at, sort_order, created_at, updated_at)

micro_tasks(id, title, created_at)

user_profile(id=1 CHECK, name, role, avatar_url, updated_at)
  (linha única; seed no primeiro boot com valores atuais)
```

Migrações inline no `init_db()`: colunas novas são adicionadas via `ALTER TABLE ... ADD COLUMN` dentro de try/except (idempotente).

---

## 6. Frontend — componentes do App.tsx

Atualmente tudo vive em [apps/web/src/App.tsx](apps/web/src/App.tsx). Lista das funções principais e **linha aproximada** pra Ctrl+G:

### Navegação / layout raiz
| Linha | Componente | Função |
|---|---|---|
| ~6 | `Surface` (type) | Union de nomes de página |
| ~35 | `NAV` (const) | Itens do menu lateral |
| ~55 | `App` (default export) | Sidebar + banner de sessão ativa + router manual por `surface` |

### Views (pages)
| Linha | Componente | URL | Descrição |
|---|---|---|---|
| ~1287 | `DashboardView` | `/dashboard` | Perfil + frase + RotinasCumpridasBar + overview do dia |
| ~3874 | `DiaView` | `/dia` | Planejador com 3 períodos (manhã/tarde/noite) + filtro + plannedItems |
| ~5022 | `CalendarView` | `/calendario` | Timeline dia/semana/mês/ano + unproductive blocks |
| ~7624 | `QuestsView` | `/quests` | Lista filtrável por área, com seção de concluídas + DateRangeFilter |
| ~7929 | `AreasView` | `/areas` | Grade das áreas editáveis (cor/nome/descrição) |
| ~9345 | `AreaDetailView` | `/areas/:slug` | Lista de projetos de uma área (via wrapper `AreaDetailRoute` que lê `:slug`) |
| ~8071 | `RoutinesView` | `/rotinas` | CRUD de rotinas |
| ~2640 | `TasksView` | `/tarefas` | CRUD de tarefas + filtros |
| ~2909 | `MicroDumpView` | `/micro-dump` | Inbox de ideias + converter pra tarefa/quest/rotina/arquivo |
| ~3604 | `ArquivadosView` | `/arquivados` | Lista de ideias arquivadas (localStorage) |

### Componentes compartilhados

**Extraídos pra `src/components/`:**
- `ui/Label` — label pequeno uppercase
- `ui/Section` — bloco com título + ícone opcional
- `ui/InlineText` — input inline estilo Notion
- `SessionHistoryModal` — modal com lista de sessões + tempo total
- `ProfileEditModal` — editar nome/cargo/avatar do Dashboard
- `DayPeriodsEditModal` — ajustar horas de manhã/tarde/noite
- `ColorPickerPopover` — paleta 12 cores + hex custom
- `DateRangeFilter` — dropdown Notion-style (hoje / 7d / 30d / mês / custom)
- `RoutineCompletionBar` — barra "Rotinas cumpridas" do Dashboard
- `MotivationalPhrase` — frase do dia editável (localStorage)
- `StatusDropdown` — dropdown de status da quest
- `RunnableControls` — play/pause/resume/stop + cronômetro. `quest` / `task` / `routine`
- `StartPauseButton` — cluster legacy de play/pause/finalize usado dentro de `QuestRow`
- `TaskRow` — row de tarefa com checkbox + edit inline + `RunnableControls`
- `PlannedItemRow` — row dentro dos períodos do `DiaView`
- `QuestRow` — row de quest (com deliverables inline quando é projeto)
- `NewQuestRow` — form inline de criar quest
- `AreaRow` — row editável de área (usado em `AreasView`)
- `RoutineEditor` — form de criar/editar rotina
- `QuestDetailPanel` — painel lateral do detalhe da quest (subtarefas, deliverables)

**Views extraídas pra `src/pages/`:**
- `DashboardPage` (com `DiaQuestRow` inline, usado só aqui) — `/dashboard`
- `DiaPage` — `/dia`
- `CalendarPage` (com `MONTH_NAMES`, `DAY_NAMES`, `pyDayToJs`, `routineMatchesDay`) — `/calendario`
- `QuestsPage` — `/quests`
- `AreasPage` (exporta `AreasView` + `AreaDetailRoute`; `AreaDetailView` privado) — `/areas`, `/areas/:slug`
- `RoutinesPage` — `/rotinas`
- `TasksPage` — `/tarefas`
- `MicroDumpPage` — `/micro-dump`
- `ArquivadosPage` — `/arquivados`

`App.tsx` agora contém só layout raiz: sidebar + banner de sessão ativa + `<Routes>`.

### Helpers

Já extraídos pra `src/utils/` (consulte a tabela de arquivos na seção 2). Cada módulo tem uma responsabilidade:

- `utils/datetime.ts` — parsing ISO + formatação de duração
- `utils/dateRange.ts` — presets do `DateRangeFilter`
- `utils/dayPeriods.ts` — config de manhã/tarde/noite (localStorage)
- `utils/blocks.ts` — cálculo de blocos improdutivos (cross-midnight)
- `utils/phrases.ts` — frases motivacionais editáveis
- `utils/quests.ts` — `STATUS_LABEL`, `STATUSES`, `PRIORITY_DOT`, `getAreaColor`, `formatDateBR`, `fmtDeadline`

---

## 7. State management

### Roteamento (React Router)
- `BrowserRouter` em [apps/web/src/main.tsx](apps/web/src/main.tsx) envolve o `<App />`
- Todas as rotas são definidas em `<Routes>` dentro de `App.tsx` (função `App`)
- Sidebar usa `<NavLink>` — estado `active` automático pelo pathname atual
- `useNavigate()` substitui as antigas props `setSurface`
- `useParams()` no `AreaDetailRoute` lê `:slug` do URL `/areas/:slug`
- ESC (tecla) navega "pra trás": se em `/areas/:slug` volta pra `/areas`; senão vai pra `/dia`
- `*` (not found) redireciona pra `/dia`

### Estado global (no App root)
- `quests: Quest[]` — recarregado em mount e a cada `sessionUpdateTrigger`
- `areas: Area[]`
- `profile: Profile`
- `activeSession: ActiveSession | null` — polling 3s + trigger manual
- `sessionUpdateTrigger: number` — contador que dispara refetchs
- `selectedQuestId: string | null` — persistido em `hq-navigation` pra restaurar drill-down em áreas

### Estado local por view
Cada View mantém seu próprio state (ex: `TasksView` tem `tasks`, `DiaView` tem `routines` + `allTasks` + `dayPlan`).

### Sources of truth

**URL (via React Router) — fonte de verdade pra navegação:**
- Qual página está aberta
- Qual área está sendo vista (`/areas/:slug`)

**Backend (SQLite) — fonte de verdade pra dados:**
- Quests, tasks, routines, sessions, areas, profile, deliverables, micro tasks, routine_logs

**localStorage — estado puramente de UI:**

| Chave | Conteúdo |
|---|---|
| `hq-navigation` | `{questId}` — último quest aberto no drill-down de uma área |
| `hq-sidebar-collapsed` | bool — sidebar estado |
| `hq-archived-ideas` | Array de ideias arquivadas |
| `hq-motivational-phrases` | Array de frases customizadas do Dashboard |
| `hq-day-periods` | `{morningStart, afternoonStart, eveningStart}` em minutos |
| `hq-unproductive-blocks` | Array de blocos improdutivos no calendário |
| `hq-day-plan` | `{morning[], afternoon[], evening[]}` — IDs planejados |
| `hq-focused-entity` | `{type, id}` — entidade em foco pra o banner manter no pause |

**Removida na Fase 2:** `hq-surface` (a URL assumiu essa função). Valores antigos ficam órfãos no localStorage do usuário sem prejuízo — nenhum código lê mais.

---

## 8. API layer

[apps/web/src/api.ts](apps/web/src/api.ts) — todas as chamadas HTTP. Constante `BASE = 'http://localhost:8001'`.

Conveções:
- `fetchX` → GET
- `createX` → POST (body)
- `updateX` → PATCH
- `deleteX` → DELETE
- Sessions: `startXSession`, `pauseXSession`, `resumeXSession`, `stopXSession`, `fetchXSessions`

Helper interno `sessionPostConflict(url)` trata erro **409** das sessions: promete rejeitar com `err.conflictTitle` contendo o título da entidade que está bloqueando.

---

## 9. Design system

### CSS vars ([apps/web/index.html](apps/web/index.html) `:root`)
- **Backgrounds**: `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-tertiary`
- **Texto**: `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-text-muted`
- **Bordas / divisores**: `--color-border`, `--color-divider`
- **Accent vermelho**: `--color-accent-primary` (crimson #8b2e2e), `--color-accent-secondary`, `--color-accent-light`, `--color-accent-subtle`, `--color-accent-vivid` (#e85d3a — urgente/hover destaque)
- **Funcionais**: `--color-success` (verde), `--color-success-light`, `--color-success-hover`, `--color-warning` (dourado), `--color-error`, `--color-purple` (reopen/retornar)
- **Calendar rotina**: `--color-routine-block`, `--color-routine-block-border` (blocos de rotina na visão semana)
- **Accent dourado**: `--color-gold`
- **Sombras**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

**FullCalendar theme vars** ficam em [apps/web/src/index.css](apps/web/src/index.css) (`--fc-*`) — não misturar com as vars do app.

### Convenções visuais
- **Tema escuro tático** (Giger/Scorn-like) — sóbrio, sem gradientes, sem brilho, sem gamificação
- **Tipografia**: monospace `IBM Plex Mono` pra números (cronômetro, prioridade)
- **Ícones**: exclusivamente **Lucide React** — sem emojis na UI
- **Padrão Notion**: edição inline em texto (componente `InlineText`), sem páginas de edição separadas
- **Cores**: sempre via CSS vars. Os poucos hex literais restantes são intencionais:
  - `AREA_COLOR_PALETTE` em `ColorPickerPopover.tsx` — persistido no banco; deve sobreviver a mudanças de tema.
  - `#fff` quando o texto está sobre background colorido (área/rotina/quest block).
  - `#6b7280` como cor default de área nova (faz parte da paleta).
  - Alguns tints de hover one-off que não valem var dedicada.

---

## 10. Como manter este documento

**Atualize quando:**
- Criar ou deletar uma página (Surface)
- Adicionar ou remover endpoint
- Adicionar ou remover tabela / coluna significativa
- Adicionar componente compartilhado novo (e onde ele fica)
- Mudar uma chave de localStorage
- Mudar convenção de design importante
- Decidir refatoração estrutural (fase 2/3 — extrair arquivos, adicionar Router)

**Não precisa atualizar:**
- Bug fix pontual
- Ajuste de estilo local
- Mudança interna de lógica sem mudar contrato

**Processo ao mexer:**
1. Antes de começar, **leia este arquivo** pra saber onde editar e não duplicar.
2. Ao terminar mudança estrutural, edite este arquivo na seção afetada.
3. Atualize o "Última atualização" no topo.

**Refatoração — status:**
- ✅ **Fase 1** (docs): este arquivo.
- ✅ **Fase 2** (React Router): URLs reais por página. `main.tsx` com `<BrowserRouter>`, `<Routes>` dentro de `App`, sidebar com `<NavLink>`, `useNavigate` em vez de `setSurface`, `/areas/:slug` com `useParams`.
- 🔄 **Fase 3** (extração de arquivos). Em progresso:
  - ✅ **Bloco 1** — `src/utils/` com helpers puros (datetime, dateRange, dayPeriods, blocks, phrases).
  - ✅ **Bloco 2** — `src/components/ui/` com átomos (`Label`, `Section`, `InlineText`).
  - ✅ **Bloco 3** — modais e popovers em `src/components/` (`SessionHistoryModal`, `ProfileEditModal`, `DayPeriodsEditModal`, `ColorPickerPopover`).
  - ✅ **Bloco 4** — rows e controles extraídos (`DateRangeFilter`, `RoutineCompletionBar`, `MotivationalPhrase`, `StatusDropdown`, `RunnableControls`, `StartPauseButton`, `TaskRow`, `PlannedItemRow`, `QuestRow`, `NewQuestRow`, `AreaRow`, `RoutineEditor`, `QuestDetailPanel`) + `utils/quests.ts`. `App.tsx` caiu de ~8900 para ~5550 linhas. `tsc --noEmit` passa limpo.
  - ✅ **Bloco 5 + 6** — todas as views viraram `src/pages/XxxPage.tsx` (`Dashboard`, `Dia`, `Calendar`, `Quests`, `Areas` + `AreaDetail`, `Routines`, `Tasks`, `MicroDump`, `Arquivados`). `App.tsx` caiu para ~514 linhas — contém só layout raiz, Routes, sidebar, banner de sessão ativa. `tsc -b --force` passa limpo. Código morto removido (`RoutineRow`, `STATUS_LABEL` local, `DESIGN_TOKENS` não usado, `isFirstRenderRef`).

# Scan / auditoria estática — 2026-04-21

Varredura de bugs, hardcodes, código morto e riscos de regressão antes do uso diário. App rodando local (FastAPI em `:8001`, Vite em `:5174`). Sem runtime end-to-end — apenas análise estática + alguns `curl` de smoke test (backend retornou `200` em `/api/quests`, `/api/routines`, `/api/tasks`, `/api/areas`, `/api/routine_overrides`).

Severidade: **crítico** quebra ou perde dado · **médio** inconsistência, degradação ou confusão · **baixo** cosmético / future-proofing.

---

## Críticos

- **`apps/api/main.py:1579-1591` — N+1 query em `list_deliverables`** · crítico
  Pra cada entregável do projeto, chama `_executed_minutes_for_deliverable` que roda uma query extra em `quest_sessions`. Com 10 entregáveis vira 11 queries só pra abrir um projeto. Vai degradar rápido quando o banco encher.
  **Fix sugerido**: uma query só com `JOIN` entre `deliverables`, `quests`, `quest_sessions`, agrupada por `deliverable_id` e somando segundos no próprio SQL.

- **`apps/web/src/pages/DashboardPage.tsx:186-188` — `useMemo(() => JSON.parse(localStorage...), [])` com deps vazia** · crítico
  O array de blocos improdutivos só é lido uma vez por mount. Se o user edita blocos no Calendário e volta pro Dashboard sem F5, o veredito continua usando a versão antiga (ignora overrides novos, bloco deletado, `effectiveUntil` etc).
  **Fix sugerido**: trocar pra `useState` + um `useEffect` que re-lê no mount de rota e/ou via evento `storage`.

---

## Médios

- **`apps/web/src/pages/DiaPage.tsx:87-92` — `fetch` raw em vez de wrapper do `api.ts`** · médio
  `refreshDoneRoutines()` usa `fetch('http://localhost:8001/api/routines?...')` direto, sem `.catch` em caso de `res.ok === false`. Duplica a URL base que já está em `api.ts:3`. Se mudar a porta ou adicionar header (ex: auth), esse ponto fica órfão.
  **Fix sugerido**: criar `fetchRoutinesForDate(targetIso)` em `api.ts` e usar aqui.

- **`apps/web/src/**/*.tsx` — `.catch(() => {})` silencia erros de API em 12 arquivos** · médio
  Padrão consistente: toda chamada assíncrona termina em `.catch(() => {})` ou variação. Se o backend retornar 500 ou 409, a UI fica em estado otimista sem feedback. Exemplos:
  - [App.tsx:438](apps/web/src/App.tsx#L438) `patchQuest(id, patch).catch(() => {})`
  - Frequente em `fetchAllRoutines`, `fetchTasks`, `deleteQuest`, etc.
  **Fix sugerido**: criar um helper `reportApiError(err, context)` que pelo menos `console.warn` + toast discreto. Sem precisar retry.

- **`apps/api/db.py:168-203` — `try: conn.execute(ALTER TABLE...); except: pass`** · médio
  Seis blocos `try/except:` nus em `init_db()`. Funciona porque o erro esperado é "column already exists", mas qualquer outra exception (lock, disk full, permissão) é engolida e o app segue com schema quebrado sem aviso.
  **Fix sugerido**: `except sqlite3.OperationalError as e: if "duplicate column" not in str(e).lower(): raise` — pega o erro esperado e deixa tudo mais explícito.

- **`apps/api/main.py:684-687` — `days_of_week` parseado com `int()` sem validação de range** · médio
  Aceita qualquer string. `"1,2,9"` viraria um dia-da-semana inválido que depois passa no filtro como `False` silencioso. Sem feedback pro frontend.
  **Fix sugerido**: validar `0 <= d <= 6` em `RoutineCreate`/`RoutineUpdate` via validator Pydantic.

- **`apps/web/src/api.ts:41,129` (e similares) — `res.json().catch(() => ({}))` mascara JSON inválido** · médio
  Se o backend cair e retornar HTML de erro (ex: 502 do proxy num cenário futuro), o parse `.catch(() => ({}))` devolve objeto vazio. Código consumidor lê `.detail` inexistente e mostra "erro genérico".
  **Fix sugerido**: envolver o JSON parse só em endpoints que legitimamente podem retornar não-JSON; no resto, deixar cair.

---

## Baixos

- **`apps/web/src/api.ts:3` e `apps/web/src/pages/DiaPage.tsx:89` — `http://localhost:8001` hardcoded** · baixo
  OK pro modelo atual (app só roda local). Se um dia quiser rodar em outra máquina ou conectar o frontend rodando em outra porta, precisa mexer em 2 lugares.
  **Fix sugerido**: `const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'` em `api.ts` e remover o uso direto no `DiaPage`.

- **`apps/api/db.py:156` — seed de perfil com `"Breno", "Analista de TI", "/breno-perfil.jpg"`** · baixo
  Roda com `INSERT OR IGNORE` na primeira inicialização. User edita pelo `ProfileEditModal` depois. Não é bug, só é um dado pessoal no código — se o repo virar público ou for compartilhado, esse nome está colado aqui.
  **Fix sugerido**: seed com `"", "", ""` e deixar o user preencher no primeiro boot.

- **`apps/api/main.py:191-194` — backfill de `completed_at = updated_at`** · baixo
  Rodou uma vez no migration pra quests já `done` sem `completed_at`. Pode ter carimbado com `updated_at` incorreto (se a quest foi editada depois de concluir). Histórico ruim pro filtro "finalizadas hoje" em casos legacy.
  **Fix sugerido**: nada agora (já rodou). Se quiser limpar, `UPDATE quests SET completed_at = NULL WHERE ...` com critério manual.

- **`apps/web/src/components/ProfileEditModal.tsx:115` — placeholder `/breno-perfil.jpg`** · baixo
  Placeholder do input do avatar menciona o nome do arquivo pessoal. Cosmético.

---

## Features dormentes (backend implementado, frontend removido)

Essas foram criadas e depois revertidas a pedido. Ficam no backend sem UI. Confirmado via `curl /api/routine_overrides` → `[]` e `curl /api/routines/invalido/overrides` → 404. Sem efeito colateral ativo.

- **`apps/api/db.py:210-238` — tabela `routine_overrides` + colunas `effective_from`/`effective_until` em `routines`** · dormente
  Migration idempotente, não afeta rotinas existentes (campos ficam `NULL`).

- **`apps/api/main.py:1240-1375` — endpoints `/api/routine_overrides`, `PUT/DELETE /api/routines/{id}/overrides/{date}`, `POST /api/routines/{id}/split`** · dormente
  Se alguém chamar direto via `curl`, funciona — e daí sim a UI de rotinas mostra comportamento inconsistente (porque ela não respeita `effective_from/until`). Mas sem UI, nunca é chamado.
  **Decisão pendente**: remover os endpoints + tabela, ou deixar pra retomar a feature depois. Hoje é código morto no servidor.

- **`apps/api/main.py` (Google Calendar)** — endpoints mockados · dormente
  Alguns retornam `{"status": "created"}` sem criar nada. Como `GOOGLE_CALENDAR_ENABLED=false` no `.env`, nunca são chamados. Se um dia ativar, vai "falhar silenciosamente" (user acha que criou evento mas não foi). Alinhado com a decisão de manter GC desativado (registrado na memória).

---

## Runtime health

Backend respondeu `200 OK` em:
- `/api/health`, `/api/quests`, `/api/routines`, `/api/tasks`, `/api/areas`, `/api/routine_overrides`

TypeScript: `tsc -b` compila limpo (último check após as últimas mudanças).
Python: `py_compile` OK em `main.py` e `db.py`.

---

## Recomendação de ordem de ataque

Se for corrigir, sugiro essa sequência (fácil → impacto):

1. **useMemo([]) no Dashboard** ([DashboardPage.tsx:186](apps/web/src/pages/DashboardPage.tsx#L186)) — 2 minutos, evita confusão óbvia.
2. **N+1 no `list_deliverables`** ([main.py:1579](apps/api/main.py#L1579)) — 10 min de SQL, ganho de perf real.
3. **Decidir sobre endpoints de override de rotina dormentes** — remove ou congela com flag. Reduz superfície.
4. **Centralizar base URL via `VITE_API_URL`** — 5 min, destrava futuro setup.
5. **`except sqlite3.OperationalError` no `db.py`** — 10 min, torna migrations mais safe.
6. **Helper de erro pra API** — algumas horas, padrão que dá visibilidade em todas as chamadas.

Resto (hardcodes de perfil, empty catches, validação de days_of_week, Google Calendar stubs) pode esperar.

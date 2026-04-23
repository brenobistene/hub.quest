# Hub Quest

App pessoal de produtividade single-user — organiza projetos, tarefas, rotinas e sessões de tempo por áreas da vida. Roda 100% local, sem deploy, sem autenticação, sem nuvem.

É um sistema feito pra quem quer ter o próprio painel de controle em vez de espalhar trabalho entre Notion, To-do, planilha, calendário e quatro apps diferentes. Tudo num lugar só, cada entidade com seu propósito claro.

---

## O que tem dentro

**Dashboard** — visão geral da semana/mês. Status híbrido dos projetos (tudo em dia / em risco / atrasado), quanto você precisa trabalhar hoje pra se manter em dia, e o item mais urgente. Seção de próximas deadlines com filtros por tipo (projetos / entregáveis).

**Dia** — planejamento do dia atual. Arrasta quests, tarefas e rotinas pros períodos (manhã / tarde / noite). Timer de sessão por item. Botão play/pause/stop com banner flutuante enquanto uma sessão está ativa.

**Calendário** — visões de dia, semana, mês e ano. Deadlines de projetos e entregáveis distribuídos nas datas. Blocos improdutivos (sono, refeições, transporte) configuráveis.

**Quests** — lista agrupada dos projetos por área, com suas subtarefas. Entregáveis drag-and-drop reordenáveis, inline editing, descrição colapsável.

**Áreas** — 5 áreas de vida default (Freelas, Faculdade, Growth, Trabalho, Health), totalmente editáveis. Cada área tem cor própria que pinta os elementos relacionados no app todo.

**Tarefas** — to-dos soltos não amarrados a projetos. Agendáveis por data e hora.

**Rotinas** — hábitos recorrentes (diário, dias úteis, semanal, mensal). Geram sessões no calendário automaticamente.

**Micro Dump** — inbox pra ideias soltas que não viraram nada ainda. Arquivável.

---

## Conceitos

- **Quest** é a unidade central. Uma quest sem `parent_id` é um *projeto*; com `parent_id` é uma *subtarefa* daquele projeto.
- **Deliverable** agrupa quests dentro de um projeto. Tem deadline própria e soma o tempo das quests filhas.
- **Session** registra trabalho real numa quest/tarefa/rotina. Abertura e fechamento via play/pause/stop.
- **Routine** é recorrente; gera uma sessão por ocorrência planejada.
- **Task** é one-off — diferente de quest porque não tem complexidade de subtarefas, entregáveis, etc.

Ver [`ARCHITECTURE.md`](ARCHITECTURE.md) pra detalhe do modelo, estrutura de pastas e decisões.

---

## Stack

- **Frontend:** React 19, Vite, TypeScript, React Router 7. Estilos predominantemente inline; ícones via Lucide.
- **Backend:** FastAPI (Python 3.12), SQLite local via `sqlite3` stdlib — sem ORM.
- **Sem deploy** — roda na máquina do usuário. Banco fica em `apps/api/hubquest.db`, ignorado pelo Git.

---

## Rodando localmente

Ver [`COMANDOS.md`](COMANDOS.md) pra comandos prontos.

Resumo:

```bash
# Backend — porta 8001
cd apps/api
python main.py

# Frontend — porta 5174+ (o Vite escolhe)
cd apps/web
npm install   # primeira vez
npm run dev
```

Abre o link que o Vite imprimir.

---

## Status

Projeto pessoal em iteração ativa. Versão atual: `v0.1.0` (primeira release formal). Breaking changes podem acontecer a qualquer momento — não use em ambiente onde você não seja o próprio usuário.

Issues e PRs estão abertos, mas não há compromisso de responder rápido.

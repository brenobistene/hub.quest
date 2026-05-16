# Product

## Register

product

## Users

Usuário único: Breno Bistene. Analista de IT/Security em ambiente corporativo, com projetos paralelos de 3D/design (freela), faculdade, estudos de segurança ofensiva, leitura curada, finanças pessoais, observação de saúde. Trabalha em duas máquinas (notebook corporativo + PC pessoal), com janelas curtas (~2h/dia) pra projetos próprios.

Contexto de uso: PC desktop em ambiente de trabalho, sessões longas no app durante o dia (corporate notebook) e à noite (PC pessoal). Não precisa de mobile-first, mas o app é responsivo. Ambiente físico tipicamente com luz dim ou monitor único iluminando o rosto. Nunca uso por terceiros, nunca login, sem nuvem.

Job-to-be-done: ter um painel de comando único pra orquestrar toda a vida pessoal (projetos, tarefas, rotinas, saúde, finanças, estudos, observação cognitiva), em vez de fragmentar entre Notion, calendário, todo-list, planilha e quatro apps. Ler estado, executar, registrar progresso real, evitar a auto-mentira.

## Product Purpose

Hub Quest é o painel de controle pessoal do usuário. Substitui um stack de apps fragmentados (Notion, Trello, Todoist, planilha de gastos, app de hábitos) por um sistema único onde cada entidade tem propósito claro e não se mistura: Projeto contém Entregável contém Quest, Rotina é recorrente, Task é avulsa, Idea é backlog cru, Mind é observação cognitiva, Health é observação corporal, Finance é fluxo monetário, Library é input curado.

Sucesso = o usuário acorda, abre o app, vê o que importa hoje em segundos, registra trabalho real durante o dia, e à noite sabe honestamente se avançou ou estagnou. Não há gamificação artificial, não há cobrança, não há fofura. O app é um instrumento.

## Brand Personality

Três palavras: **Brutal. Hipnótico. Controlado.**

DNA visual: REZZ (geometria limpa hipnótica, vermelho profundo sobre preto, ocular) cruzado com Control / Hell is Us (sigilos brutais, mecanismos arcanos, peso ritualístico, ambiente etéreo frio). Tipografia técnica (Rajdhani uppercase com letter-spacing, JetBrains Mono em dados). Voz: direta, factual, sem fofura. Status sempre como observação, nunca como cobrança.

Emoção alvo: foco absoluto, sensação de comando, peso. Não ansiedade, não competição, não animação cute.

A identidade é codificada na marca **EXEC** (logo: dot central + anéis quebrados + signature dot, oxblood sobre preto). Hub Quest é o nome do produto; EXEC é a identidade visual que o reveste.

## Anti-references

Coisas que o Hub Quest explicitamente NÃO deve parecer:

- **Emojis em UI / icons "fofos" / linguagem alegre.** Nada de "🎉 Você completou uma tarefa!". Trabalho real não precisa de festa.
- **Gamificação (XP, levels, achievements, badges, streaks como troféu).** Streak counter existe como métrica honesta de consistência, não como ranking. Sem RPG, sem rankings, sem comparação social.
- **SaaS dashboard clássico**: gradient hero + 4 cards iguais com ícone+heading+texto + line chart azul corporativo. A skill chama de "hero-metric template" e bane explicitamente.
- **Notion-pastel-cheery aesthetic**: off-whites suaves, illustrations amigáveis, sidebar com emojis. Falta peso.
- **Healthcare white+teal** ou **observability dark-blue** ou **fintech navy+gold** ou **crypto neon-on-black**: primeiros reflexos de categoria. Hub Quest não é nenhuma dessas categorias e não deve ser confundido com elas.

## Design Principles

1. **Instrumento, não joguinho.** Cada elemento existe pra reduzir cognitive load do operador. Sem decorar, sem celebrar. O usuário trabalha aqui, não brinca. Status são observações factuais, não cobrança nem premiação.

2. **Converger, não dispersar.** Tudo num app, em hierarquia clara (Area → Projeto → Entregável → Quest), cada tipo com semântica própria que não se mistura. Resistir à tentação de adicionar tipos novos quando um dos existentes serve.

3. **Identidade EXEC, não template.** A vibe brutal-hipnótica REZZ + Control não é decoração: é proteção contra parecer mais um SaaS. Quando um padrão começa a parecer genérico (4 cards iguais, big number gradient), refazer com estrutura diferente.

4. **Honestidade temporal e métrica.** Métricas mostram realidade (streak = dias consecutivos, drift = falta de registro, deadline = data real). Sem inflar progresso, sem gamificar engajamento. Se o domínio está dormente, o app diz `NO RECENT SIGNAL`, não `Vamos voltar?`.

5. **Peso visual com propósito.** Glow, chamfer, brackets e tech labels existem pra criar hierarquia HUD e reforçar a identidade. Quando o peso vira ruído (border-stripe colorida cobrindo toda card, glassmorphism em tudo, glow em texto pequeno), é falha — refatorar.

## Accessibility & Inclusion

WCAG AA mínimo: contraste de texto sempre legível, mesmo em texto pequeno mono. Nada de texto fino branco sobre fundo cinza claro.

`prefers-reduced-motion`: respeitado via `useReducedMotion` em `Motion.tsx`. Animações de spring/translate desligam, mantém só fade. AnimatedNumber pula a contagem e mostra o valor final direto. Live-pulse vira estático.

Single-user, sem necessidade de i18n. Layout responsivo já existente (sidebar colapsa em mobile como drawer), mas otimização principal é desktop.

Daltonismo: cor nunca é o único signal — sempre acompanhada de label, glow, ou ícone. Status crítico (atrasado/em risco) usa cor + texto explícito.

Sem screen-reader rigor (single-user), mas semântica HTML básica (button vs div, h1-h3, label associada a input).

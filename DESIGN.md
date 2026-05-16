---
name: MAINFRAME
description: Single-user personal operating system with HUD-grade dark tactical identity (EXEC). Mission Control feel, Hell Is Us atmosphere, REZZ + Control DNA.
colors:
  accent-red-deep: "#9f1239"
  accent-red-mid: "#be123c"
  accent-red-light: "#fb7185"
  accent-red-subtle: "#4c0519"
  accent-red-vivid: "#dc2626"
  cool-blue: "#8fbfd3"
  cool-blue-light: "#cfe2ea"
  cool-blue-deep: "#536e7a"
  fog-blue: "#283239"
  fog-white: "#d4dadc"
  near-black: "#0b0d12"
  near-black-raised: "#131519"
  near-black-panel: "#1c1f25"
  warm-soft: "#ece8e3"
  warm-soft-mid: "#b8b0a8"
  warm-soft-low: "#7c7570"
  warm-soft-muted: "#585350"
  muted-green: "#5e7a52"
  muted-green-light: "#7d9a6f"
  gold-dim: "#c08a3a"
  purple-soft: "#9b7dd9"
  gold-mark: "#b8923a"
  routine-block: "#221f23"
typography:
  display:
    fontFamily: "Rajdhani, Inter, -apple-system, Segoe UI, sans-serif"
    fontWeight: 600
    letterSpacing: "0.015em"
  body:
    fontFamily: "Chakra Petch, Inter, -apple-system, Segoe UI, sans-serif"
    fontWeight: 400
  mono:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontFeature: "tabular-nums"
    letterSpacing: "0"
  serif:
    fontFamily: "Bitter, Iowan Old Style, Georgia, serif"
    fontStyle: "italic"
    fontWeight: 400
  tech-label:
    fontFamily: "JetBrains Mono, IBM Plex Mono, monospace"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.28em"
    textTransform: "uppercase"
  tech-id:
    fontFamily: "JetBrains Mono, IBM Plex Mono, monospace"
    fontSize: "9px"
    fontWeight: 500
    letterSpacing: "0.18em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent-red-deep}"
    textColor: "{colors.warm-soft}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-red-mid}"
    textColor: "{colors.warm-soft}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.cool-blue-light}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.accent-red-light}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.warm-soft-low}"
    rounded: "{rounded.sm}"
    size: "28px"
  card-glass:
    backgroundColor: "rgba(28, 31, 37, 0.55)"
    textColor: "{colors.warm-soft}"
    rounded: "{rounded.md}"
    padding: "14px 18px"
  pulse-square:
    backgroundColor: "{colors.accent-red-deep}"
    size: "8px"
---

# Design System: MAINFRAME

## 1. Overview

**Creative North Star: "The Mission Control"**

MAINFRAME é o console de uma operação pessoal. O usuário não está usando um app; está sentado no console de uma operação de uma pessoa só, lendo telemetria da própria vida, executando, registrando. A atmosfera é Hell Is Us cinemática (fog azul cool, halo branco off-center, mancha oxblood top-left, vinheta inferior pesada) mas a estrutura é HUD CP2077 (tech labels uppercase com letter-spacing largo, IDs em mono, hairlines de luz, chamfers diagonais cortando cantos de cards). REZZ inspira a economia hipnótica: poucos elementos, peso visual onde importa, vermelho contido nos pontos de comando.

O sistema rejeita explicitamente: emojis em UI, gamificação (XP, levels, badges, streaks-como-troféu), o template SaaS clássico (gradient hero + 4 cards iguais + line chart azul), Notion-pastel-cheery (off-whites suaves, illustrations amigáveis), e os reflexos de categoria (healthcare white-teal, observability dark-blue, fintech navy-gold, crypto neon-on-black). Trabalho real não precisa de festa, instrumento não precisa de fofura.

A densidade é maximalista no atmosferismo (grain global, gradientes em camadas, glows sutis, glass com backdrop blur) e minimalista nos elementos (tipografia técnica precisa, espaços generosos, vermelho usado com parcimônia ritualística). O ambiente é o protagonista; os componentes flutuam dentro dele.

**Key Characteristics:**
- Atmosfera cinemática Hell Is Us + estrutura HUD CP2077
- Vermelho oxblood ritualístico, ice azul como acento técnico, warm soft no texto (nunca branco puro, nunca preto puro)
- Tipografia tripla: Rajdhani display tall-condensed, Chakra Petch body, JetBrains Mono tabular pra dados
- Chamfer diagonals e hairlines como assinatura geométrica
- Glass + grain + glow como vocabulário ambiente
- Pulse-square oxblood como signal "live" — não pisca emoji, pisca sigilo

## 2. Colors

Paleta dark com warm-soft no texto e dois acentos contrastantes: oxblood pra comando/atenção e ice azulado pra tech/structural. Backgrounds e neutros têm tint warm (chroma sutil em direção ao quente), nada de preto puro nem branco puro.

### Primary

- **Accent Red Deep** (`#9f1239`): cor de comando primária. Botões primários, status atrasado/em risco, pulse-square ao vivo, accent forte em headers. Oxblood ritualístico — usado com parcimônia, nunca como decoração.
- **Accent Red Mid** (`#be123c`): hover do primary, accent secundário em badges.
- **Accent Red Light** (`#fb7185`): hover de ícones destrutivos, error subtle.
- **Accent Red Subtle** (`#4c0519`): mark deep, marcações estáticas de "perigo passado".
- **Accent Red Vivid** (`#dc2626`): error puro, alarme. Usado fora do regime ritualístico — é a hora de gritar.

### Secondary

- **Cool Blue** (`#8fbfd3`): tech labels ativos, glow ice, hairlines de luz. Não é o accent principal, é o estrutural — diz "tech, controle, leitura técnica".
- **Cool Blue Light** (`#cfe2ea`): texto sobre superfície oxblood, valores numéricos em destaque.
- **Cool Blue Deep** (`#536e7a`): bordas ativas, deep ice, hairlines escuras.
- **Fog Blue** (`#283239`): atmosphere underlayer, blocos de rotina, calm panels.
- **Fog White** (`#d4dadc`): halo branco-cinza da atmosphere, partículas de luz no fog.

### Neutral

- **Near Black** (`#0b0d12`): background primário. Quase-preto azulado — nunca `#000`.
- **Near Black Raised** (`#131519`): segundo nível, dropdowns nativos.
- **Near Black Panel** (`#1c1f25`): superfície de cards.
- **Warm Soft** (`#ece8e3`): texto primário. Off-white com tinta levemente quente — nunca `#fff`.
- **Warm Soft Mid** (`#b8b0a8`): texto secundário.
- **Warm Soft Low** (`#7c7570`): texto terciário, labels.
- **Warm Soft Muted** (`#585350`): texto muted, placeholder.

### Semantic

- **Muted Green** (`#5e7a52`): success — verde-folha dessaturado, nunca grita. "Em dia", "completed".
- **Muted Green Light** (`#7d9a6f`): hover/active de success.
- **Gold Dim** (`#c08a3a`): warning, lembrete pendente. Dim, atenção sem alarme.
- **Purple Soft** (`#9b7dd9`): marcação de Library, instrumental.

### Named Rules

**The Ritualistic Red Rule.** Accent Red Deep (`#9f1239`) é tratado como reagente: usar quando o elemento precisa **comandar** o olho (botão primary, status atrasado, pulse ao vivo). Nunca como decoração de card, nunca em border-stripe colorida, nunca espalhado em mais de um terço da tela. Sua raridade é o que cria peso.

**The No Pure Black/White Rule.** MAINFRAME nunca usa `#000` ou `#fff`. Fundo é Near Black (`#0b0d12`) com tint azulado; texto é Warm Soft (`#ece8e3`) com tint warm. O contraste vem da escala, não dos extremos.

**The Two Accents Rule.** Apenas Oxblood (comando) e Cool Blue (tech) carregam saturação. Tudo mais é neutro (warm-soft pra texto, near-black pras superfícies). Adicionar um terceiro accent é falha de disciplina — fold em um dos dois.

## 3. Typography

**Display Font:** Rajdhani (com Inter como fallback). Tall + condensed; +0.015em letter-spacing pra dar ar HUD tech sem perder densidade.
**Body Font:** Chakra Petch (com Inter como fallback). Geométrica com pequenos cortes técnicos, casa com Rajdhani sem competir.
**Mono Font:** JetBrains Mono (com IBM Plex Mono como fallback). `font-variant-numeric: tabular-nums` global pra dados se alinharem.
**Serif Italic:** Bitter (com Iowan/Georgia fallback). Reservada pra hero copy emocional, empty states líricos, frases-marca. Quando a UI "fala com você".

**Character:** mono pra dados (precisão), display pra comando (peso), body pra leitura (densidade), serif italic pra alma (raro). Quatro vozes diferentes pra quatro funções diferentes — nunca trocar.

### Hierarchy

- **Display** (Rajdhani 700, 40px clamp, line-height 1): hero headlines, veredicts (`VITALS NOMINAL`, `STREAK LOCKED`, `SIGNAL FRAGMENTED`). Sempre uppercase + 0.02em letter-spacing nos heros.
- **Headline** (Rajdhani 600, 22px, line-height 1.2): título de seção/página, nome de domínio em header.
- **Title** (Rajdhani 600, 18px, +0.22em letter-spacing): nomes de blocos importantes, headers de painel.
- **Body** (Chakra Petch 400, 13-14px, line-height 1.5): prosa funcional, descrições, conteúdo de modal. Cap em 65-75ch quando texto longo.
- **Mono Stat** (JetBrains Mono 700, 18-20px, tabular-nums, +0.02em): números scoreboard. `AnimatedNumber` anima a contagem.
- **Tech Label** (JetBrains Mono 700, 10px, +0.28em letter-spacing, uppercase): labels de seção (`BIO.MATRIX`, `PROJECT.MATRIX`, `LOG.STREAM`). Assinatura HUD.
- **Tech ID** (JetBrains Mono 500, 9-10px, +0.18em letter-spacing): IDs técnicos (`// PRA FICAR EM DIA`, `SCAN @ 14:32`).

### Named Rules

**The Mono For Numbers Rule.** Todo número que muda (saldo, contador, streak, tempo) usa `var(--font-mono)` com `font-variant-numeric: tabular-nums`. Dois dígitos sempre ocupam a mesma largura. Sem isso, números viram pulando ao animar.

**The Uppercase Letter-Spacing Rule.** Texto em ALL CAPS sempre tem letter-spacing aumentado (mínimo 0.04em, ideal 0.18-0.28em). All caps sem tracking é grito sem ar.

**The Serif Reserved Rule.** Bitter italic só aparece em momentos onde a UI "fala" com o operador. Empty state poético, frase-marca, micro-narrativa. Nunca em label funcional, nunca em botão.

## 4. Elevation

Sistema híbrido: usa **glass translucente + grain global + glows sutis** mais que sombras tradicionais. O background tem 7 camadas de radial-gradient compondo a atmosphere Hell Is Us; os elementos flutuam dentro dela usando `hq-glass` (rgba semi-transparente sobre cor de painel) ao invés de elevar com box-shadow pesada.

Sombras existem mas são raras e estruturais — pra modais e estados focus. Nunca como decoração ambiental.

### Shadow Vocabulary

- **shadow-sm** (`0 2px 8px rgba(0,0,0,0.18)`): elevação leve de chip ativo.
- **shadow-md** (`0 6px 22px rgba(0,0,0,0.32)`): elevação de dropdown / popover.
- **shadow-lg** (`0 14px 40px rgba(0,0,0,0.45)`): elevação alta de menu flutuante.
- **shadow-xl** (`0 24px 60px rgba(0,0,0,0.55)`): hero element raro.
- **shadow-modal** (`0 20px 80px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)`): backdrop de modal.
- **shadow-chrome-inner** (`inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3)`): inset chrome em superfícies metálicas.
- **glow-accent** (`0 0 0 1px rgba(159,18,57,0.4), 0 0 24px rgba(159,18,57,0.25)`): focus oxblood.
- **glow-success** (`0 0 0 1px rgba(122,154,138,0.4), 0 0 24px rgba(122,154,138,0.20)`): focus success.
- **focus-ring** (`0 0 0 2px var(--color-bg-primary), 0 0 0 3px var(--color-ice)`): focus visible global.

### Named Rules

**The Glass-Over-Shadow Rule.** Pra dar peso a um painel, primeiro tentar `hq-glass` + `hq-grain` + `hq-chamfer-bl`. Sombra é último recurso, e nunca sombra colorida (color-bleed em background escuro fica feio).

**The Atmosphere-Is-Layer-Zero Rule.** O `body::before` (grain) e os 7 radial-gradients do `body` já dão profundidade. Não competir com isso adicionando blur/glow em cada componente — vira ruído. Glow é signal, não textura.

## 5. Components

Personalidade dos componentes: **atmosférico e tátil**. Glass + grain + glow são vocabulário ambiente; cada elemento parece flutuar dentro da atmosphere Hell Is Us em vez de pousar sobre um background sólido. Chamfers diagonais e hairlines de luz dão a sensação tátil HUD.

### Buttons

- **Shape:** retangular com `--radius-sm` (6px) em primary/ghost; chamfer diagonal (`clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)`) nos botões signature da Micro Dump e CyberShell. Nunca pill em botão de ação.
- **Primary** (`hq-btn--primary`): background oxblood (`accent-red-deep`), texto warm-soft, padding `7px 14px`, fontSize 11, fontWeight 600, letter-spacing 0.05em, uppercase. Hover: background `accent-red-mid` + translate-y -1px.
- **Ghost** (`hq-btn--ghost`): background transparent, border 1px `cool-blue-deep`, texto `cool-blue-light`. Hover: background `rgba(143,191,211,0.14)` + glow ice.
- **Danger** (`hq-btn--danger`): mesma estrutura ghost, mas border + texto em `accent-red-light`. Hover: background `rgba(159,18,57,0.10)`.
- **Icon button** (`hq-icon-btn`): 28×28, sem background, ícone Lucide 13px strokeWidth 1.6. Hover: cor vai pra ice-light (ou error pra `--danger`).

### Cards / Containers

- **Glass Card** (`hq-glass`): `background: rgba(28,31,37,0.55)`, `backdrop-filter: blur(6px)`. Combina com `hq-grain` (noise SVG overlay) pra textura. Combina com `hq-chamfer-bl` ou `hq-chamfer-tr` pra corte diagonal de canto.
- **Glass Elevated** (`hq-glass-elevated`): versão hero, mais opaca, sempre tem hairline ice no topo (`hq-hairline-ice`).
- **Corner Style:** chamfer diagonais (`clip-path: polygon(...)`) cortando bottom-left, top-right, ou cross. Border-radius padrão 0 nos elementos com chamfer (incompatível). Em cards sem chamfer, `--radius-md` (10px) é o default.
- **Border:** 1px `color-border` (rgba(236,232,227,0.06)) — quase invisível, só sugere limite. `color-border-strong` (rgba(236,232,227,0.12)) em estados ativos.
- **Internal Padding:** geralmente `14px 18px` em cards lista, `24px 28px` em hero cards.

### Inputs / Fields

- **Estilo (`cyberInputFull`):** background `rgba(8,12,18,0.55)`, border 1px `color-border`, texto `cool-blue-light`, mono font, padding `8px 12px`, letter-spacing 0.05em. Chamfer bottom-right opcional.
- **Focus:** border vira `cool-blue` (`#8fbfd3`), `box-shadow: 0 0 10px rgba(143,191,211,0.30)`. Glow ice como signal de "isto está sendo editado".
- **Erro:** border + texto vão pra `accent-red-light`.

### Navigation (Sidebar)

- **Estilo:** vertical fixed em desktop, drawer em mobile. Largura 72px (collapsed) ou 220px (expanded). Em mobile vira 280px overlay.
- **Itens:** ícone Lucide + label uppercase (Rajdhani 11px), badges numéricos quando há contador (e.g. tarefas atrasadas em oxblood, pendências health em gold).
- **Ativo:** background `rgba(143,191,211,0.08)`, border-left ice + texto ice-light. Border-left 2px é exceção semântica permitida aqui (nav ativo, não card accent).

### Signature: PulseSquare

Quadrado 8×8 oxblood pulsando 1.6s ease-smooth infinito. Sinal de "ao vivo / acontecendo agora" (registro Health criado hoje, sessão de quest ativa). Substitui o `◉` ASCII das versões antigas. Versão estática (não pulsando) usa a cor do domínio com `inset 0 0 0 1px rgba(255,255,255,0.12)` e opacity 0.65.

### Signature: Tech Label / Tech ID

`hq-tech-label`: prefixo `//` em ice + label uppercase 10px JetBrains Mono +0.28em. Usado em headers de seção (`// PRA FICAR EM DIA`, `BIO.STATUS`, `OBSERVATIONAL ONLY`).
`hq-tech-id`: 9-10px, +0.18em, sem prefixo `//`. Usado em metadata técnico (`SCAN @ 14:32`, `// SEM PENDÊNCIAS NO FLUXO`).

### Signature: Hairline Ice / Oxblood

Linha 1px gradiente no topo de hero cards. Ice (`hq-hairline-ice`) é o default; Oxblood (`hq-hairline-oxblood`) reservado pra estados de comando crítico. Não é decoração — é assinatura HUD que separa hero card do resto.

## 6. Do's and Don'ts

### Do:

- **Do** usar Near Black (`#0b0d12`) e Warm Soft (`#ece8e3`) como extremos de fundo/texto. Nunca `#000` ou `#fff`.
- **Do** reservar Accent Red Deep (`#9f1239`) pra comando ritualístico — botões primários, status crítico, pulse ao vivo. Nunca como decoração de card.
- **Do** usar mono (`JetBrains Mono` + `tabular-nums`) em todo número que muda. Display vira mono na escala dos stats scoreboard.
- **Do** envolver hero cards em `hq-glass` + `hq-grain` + `hq-chamfer-bl` antes de pensar em box-shadow.
- **Do** combinar `hq-tech-label` (com prefixo `//`) com section headers pra reforçar a vibe HUD.
- **Do** respeitar `prefers-reduced-motion` usando `useReducedMotion()` em `Motion.tsx` — animações de spring/translate viram fade puro.
- **Do** usar `AnimatedNumber` em stats scoreboard pra contagem suave (`duration={0.7}`).
- **Do** variar spacing pra criar ritmo. Mesmo padding em tudo é monotonia.
- **Do** usar Bitter italic só em momentos onde a UI "fala" com o operador (empty state, frase-marca).

### Don't:

- **Don't** usar `border-left` ou `border-right` >1px como accent colorido em cards/lista/callouts. Reescrever com border completa, background tint, leading number/icon, ou nada. (Ban absoluto da skill — MAINFRAME atualmente viola isso em RecordRow, hero cards e DomainPanel; refatorar.)
- **Don't** usar emojis em UI ("🎉", "✨", "⚡", ícones cute). Lucide stroke-icon é o vocabulário.
- **Don't** gamificar (XP, levels, badges, achievements, streaks como troféu). Streak counter é métrica de observação, não conquista.
- **Don't** cair no template SaaS clássico: gradient hero + 4 cards iguais com ícone+heading+texto + line chart azul corporativo. Refatorar com estrutura diferente.
- **Don't** usar gradient text (`background-clip: text` em gradient). Texto sempre cor sólida. Ênfase via weight/size.
- **Don't** abusar de glassmorphism. Use `hq-glass` com propósito, não em tudo.
- **Don't** usar em dashes (`—`) ou `--` em copy. Vírgula, dois pontos, ponto e vírgula, ponto, ou parênteses.
- **Don't** introduzir um terceiro accent (verde-vibrante, roxo-vivido, etc). Paleta é Oxblood + Cool Blue + neutros warm-soft. Semantic (success/warning/error) usa dessaturado.
- **Don't** animar propriedades de layout (`width`, `height`, `top`, `left`). Animar `transform` e `opacity`.
- **Don't** usar `cubic-bezier(0.34, 1.56, 0.64, 1)` (`ease-spring` com bounce) fora de feedback de press/spring específico. Default é `ease-emphasis` ou `ease-smooth`, exponencial sem bounce.
- **Don't** reproduzir reflexos de categoria: healthcare white+teal, observability dark-blue, fintech navy+gold, crypto neon-on-black. MAINFRAME é Mission Control, não nenhum desses.
- **Don't** usar `#` em comentários de copy ("Ó", "Olha"). Voz direta, factual, sem fofura.

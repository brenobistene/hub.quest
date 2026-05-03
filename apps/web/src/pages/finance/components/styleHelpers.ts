/**
 * Helpers de estilo + formatação compartilhados entre os componentes do
 * Hub Finance.
 *
 * Tokens vêm de `index.html` (--space-*, --text-*, --radius-*, --motion-*,
 * --glass-*, --glow-*). Componentes novos devem usar `<Button>`, `<Card>`,
 * `<IconButton>` de Primitives.tsx — eles vêm com hover/animação prontos.
 *
 * As funções abaixo (primaryButton/ghostButton/etc) ainda existem pra
 * compat com componentes não-migrados, mas não têm hover (inline style não
 * suporta :hover). Migra pros componentes do Primitives.
 */

// ─── Constants ──────────────────────────────────────────────────────────

/** Tamanhos canônicos pra ícones Lucide. */
export const ICON_SIZE = { xs: 11, sm: 12, md: 14, lg: 16, xl: 20 } as const

/** StrokeWidth padrão pra ícones em UI. */
export const ICON_STROKE = 1.8
export const ICON_STROKE_HEAVY = 2

// ─── Text styles ────────────────────────────────────────────────────────

/** Label de seção (header de modal/card). Único lugar com uppercase: ajuda
 *  hierarquizar contra o conteúdo. */
export function sectionLabel(): React.CSSProperties {
  return {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: 'var(--space-3)',
  }
}

/** Label de campo de form. Sentence-case. */
export function fieldLabel(): React.CSSProperties {
  return {
    display: 'block',
    marginBottom: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-tertiary)',
    fontWeight: 500,
  }
}

/** Hint embaixo de campo (texto explicativo curto). */
export function hintText(): React.CSSProperties {
  return {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
    marginTop: 'var(--space-1)',
    lineHeight: 1.5,
  }
}

// ─── Form controls ──────────────────────────────────────────────────────

export function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--glass-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-2) var(--space-3)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
  }
}

// ─── Buttons (legado — usar <Button> de Primitives pra novos componentes) ──

/** @deprecated Use <Button variant="primary"> de Primitives — vem com hover/animação. */
export function primaryButton(): React.CSSProperties {
  return {
    background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-bg-primary)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    boxShadow: '0 1px 0 rgba(255, 255, 255, 0.15) inset, var(--shadow-sm)',
  }
}

/** @deprecated Use <Button variant="ghost"> de Primitives — vem com hover/animação. */
export function ghostButton(): React.CSSProperties {
  return {
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  }
}

// ─── Layout primitives ──────────────────────────────────────────────────

export function modalOverlay(): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-overlay)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    animation: 'hq-overlay-in var(--motion-base) var(--ease-smooth) both',
  }
}

/** Card base — pra blocos de informação na Visão Geral, modais, etc. */
export function cardBase(): React.CSSProperties {
  return {
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-5)',
  }
}

// ─── Formatters ─────────────────────────────────────────────────────────

export function formatBRL(value: number): string {
  return formatMoney(value, 'BRL')
}

export function formatMoney(value: number, moeda: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: moeda, minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
    }).format(value)
  }
}

export function formatDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

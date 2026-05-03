/**
 * Componentes primitivos compartilhados do Hub Finance.
 *
 * Estética: Modern Minimal Glass — surfaces com backdrop-filter, hover lift
 * + glow, animações spring. Consome tokens de index.html.
 *
 * Sempre prefira esses componentes em vez de inline style — eles vêm com
 * hover/focus/animação prontos via CSS classes.
 */
import type { ReactNode, MouseEventHandler } from 'react'

// ─── Card ────────────────────────────────────────────────────────────────

/** Card glass — surface base pra blocos de info no dashboard.
 *  - hoverable: lift + brightness no hover (use pra cards interativos)
 *  - elevated: glass mais opaco + sombra (modal, dialogs) */
export function Card({
  children, hoverable = false, elevated = false, padding = 'md', style, onClick,
}: {
  children: ReactNode
  hoverable?: boolean
  elevated?: boolean
  padding?: 'sm' | 'md' | 'lg' | 'none'
  style?: React.CSSProperties
  onClick?: MouseEventHandler<HTMLDivElement>
}) {
  const padMap = {
    none: '0',
    sm: 'var(--space-3)',
    md: 'var(--space-5)',
    lg: 'var(--space-6)',
  }
  const cls = [
    elevated ? 'hq-glass-elevated' : 'hq-glass',
    hoverable && 'hq-card-hoverable',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      onClick={onClick}
      style={{
        padding: padMap[padding],
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── Button ──────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'ghost' | 'danger'

/** Botão padrão. Vem com hover lift + glow + spring transitions. */
export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button',
  fullWidth, leadingIcon, trailingIcon,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  type?: 'button' | 'submit'
  fullWidth?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}) {
  const cls = `hq-btn hq-btn--${variant}`
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cls}
      style={fullWidth ? { width: '100%' } : undefined}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  )
}

// ─── IconButton ──────────────────────────────────────────────────────────

type IconButtonVariant = 'default' | 'danger' | 'accent' | 'bare'

/** Botão icon-only padronizado. `aria-label` obrigatório. */
export function IconButton({
  children, label, onClick, variant = 'default', disabled, type = 'button',
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  variant?: IconButtonVariant
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const className = variant === 'bare'
    ? 'hq-icon-btn-bare'
    : variant === 'danger'
      ? 'hq-icon-btn hq-icon-btn--danger'
      : variant === 'accent'
        ? 'hq-icon-btn hq-icon-btn--accent'
        : 'hq-icon-btn'

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={className}
    >
      {children}
    </button>
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────────

/** Estado vazio padrão — "nada aqui ainda". */
export function EmptyState({ text, sub, icon, dense = false }: {
  text: string
  sub?: string
  icon?: ReactNode
  dense?: boolean
}) {
  return (
    <div style={{
      padding: dense ? 'var(--space-5) var(--space-4)' : 'var(--space-10) var(--space-5)',
      border: '1px dashed var(--color-border)',
      borderRadius: 'var(--radius-md)',
      textAlign: 'center',
      color: 'var(--color-text-muted)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-2)',
      animation: 'hq-fade-up var(--motion-base) var(--ease-emphasis) both',
    }}>
      {icon && (
        <div style={{ color: 'var(--color-text-tertiary)', opacity: 0.6 }}>
          {icon}
        </div>
      )}
      <div style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-tertiary)',
        fontWeight: 500,
      }}>
        {text}
      </div>
      {sub && (
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          maxWidth: 320,
          lineHeight: 1.5,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Modal frame ─────────────────────────────────────────────────────────

/** Frame padrão de modal: overlay com blur + content com entrance animation.
 *  Use no lugar de inline `modalOverlay()` quando criar novo modal. */
export function ModalFrame({
  children, onClose, minWidth = 460, maxWidth = 560, padding = 'md',
}: {
  children: ReactNode
  onClose: () => void
  minWidth?: number
  maxWidth?: number
  padding?: 'md' | 'lg'
}) {
  const padValue = padding === 'lg' ? 'var(--space-6)' : 'var(--space-5)'
  return (
    <div
      onClick={onClose}
      className="hq-animate-overlay-in"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="hq-glass-elevated hq-animate-modal-in"
        style={{
          padding: padValue,
          minWidth,
          maxWidth,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}

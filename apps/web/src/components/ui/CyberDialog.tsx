import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react'
import { subscribe, dismissDialog, type DialogItem, type DialogVariant } from '../../lib/dialog'

/**
 * Mount uma vez no root da app (App.tsx). Subscreve no store de diálogos
 * (`lib/dialog.ts`) e renderiza modais cyber sobre tudo via portal.
 *
 * Empilhamento: múltiplos diálogos abertos simultâneos renderizam stacked
 * (cada um com seu próprio backdrop + z-index incremental). O usuário só
 * interage com o do topo — backdrops dos inferiores ficam ofuscados.
 */
export function DialogPortal() {
  const [items, setItems] = useState<DialogItem[]>([])
  useEffect(() => subscribe(setItems), [])

  if (items.length === 0) return null

  return (
    <>
      {items.map((item, idx) => (
        <DialogModal
          key={item.id}
          item={item}
          isTop={idx === items.length - 1}
          stackIndex={idx}
        />
      ))}
    </>
  )
}

const VARIANT_CONFIG: Record<DialogVariant, {
  accent: string
  accentLight: string
  glowAlpha: string
  Icon: typeof AlertTriangle
}> = {
  default: {
    accent: 'var(--color-ice)',
    accentLight: 'var(--color-ice-light)',
    glowAlpha: 'rgba(143, 191, 211, 0.30)',
    Icon: HelpCircle,
  },
  danger: {
    accent: 'var(--color-accent-vivid)',
    accentLight: 'var(--color-accent-light)',
    glowAlpha: 'rgba(159, 18, 57, 0.35)',
    Icon: AlertTriangle,
  },
  warning: {
    accent: 'var(--color-warning)',
    accentLight: 'var(--color-warning-light)',
    glowAlpha: 'rgba(200, 169, 122, 0.30)',
    Icon: AlertCircle,
  },
  success: {
    accent: 'var(--color-success)',
    accentLight: 'var(--color-success-light)',
    glowAlpha: 'rgba(94, 122, 82, 0.30)',
    Icon: CheckCircle2,
  },
}

function DialogModal({ item, isTop, stackIndex }: {
  item: DialogItem
  isTop: boolean
  stackIndex: number
}) {
  const variant = item.variant ?? 'default'
  const cfg = VARIANT_CONFIG[variant]
  const { Icon } = cfg

  const confirmLabel = item.confirmLabel ?? (item.kind === 'alert' ? 'OK' : 'CONFIRMAR')
  const cancelLabel = item.cancelLabel ?? 'CANCELAR'

  // Esc fecha (cancel pra confirm, OK pra alert). Enter confirma. Só
  // aplica no diálogo do topo da pilha.
  useEffect(() => {
    if (!isTop) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismissDialog(item.id, item.kind === 'alert')
      } else if (e.key === 'Enter') {
        dismissDialog(item.id, true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isTop, item.id, item.kind])

  return createPortal(
    <div
      className="hq-animate-fade"
      onClick={() => {
        if (item.kind === 'confirm') dismissDialog(item.id, false)
      }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.62)',
        backdropFilter: 'blur(4px)',
        zIndex: 9000 + stackIndex,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="hq-animate-fade-up"
        style={{
          position: 'relative',
          minWidth: 360, maxWidth: 520,
          background: 'rgba(8, 12, 18, 0.96)',
          border: `1px solid ${cfg.accent}`,
          borderRadius: 0,
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
          boxShadow: `0 0 32px ${cfg.glowAlpha}, 0 12px 40px rgba(0, 0, 0, 0.7)`,
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Header band com ícone + tech-id */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(143, 191, 211, 0.22)',
          background: 'rgba(143, 191, 211, 0.04)',
        }}>
          <Icon size={16} strokeWidth={2} style={{ color: cfg.accentLight, flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, fontWeight: 700,
            color: cfg.accentLight,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            flex: 1,
          }}>
            <span style={{ color: cfg.accent, opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
            {item.title ?? (item.kind === 'alert' ? 'NOTIFICAÇÃO' : 'CONFIRMAR AÇÃO')}
          </span>
        </div>

        {/* Mensagem */}
        <div style={{
          padding: '20px 22px',
          fontFamily: 'var(--font-display)',
          fontSize: 14, fontWeight: 500,
          color: 'var(--color-text-primary)',
          lineHeight: 1.55,
          letterSpacing: '0.01em',
          whiteSpace: 'pre-wrap',
        }}>
          {item.message}
        </div>

        {/* Footer com botões */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 16px',
          borderTop: '1px solid rgba(143, 191, 211, 0.22)',
          background: 'rgba(0, 0, 0, 0.25)',
        }}>
          {item.kind === 'confirm' && (
            <button
              onClick={() => dismissDialog(item.id, false)}
              style={{
                background: 'rgba(8, 12, 18, 0.55)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10, fontWeight: 700,
                padding: '7px 14px',
                cursor: 'pointer',
                borderRadius: 0,
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)',
                letterSpacing: '0.22em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-text-secondary)'
                e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.35)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
              }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            autoFocus={isTop}
            onClick={() => dismissDialog(item.id, true)}
            style={{
              background: variant === 'danger'
                ? 'rgba(159, 18, 57, 0.16)'
                : variant === 'success'
                  ? 'rgba(94, 122, 82, 0.16)'
                  : variant === 'warning'
                    ? 'rgba(200, 169, 122, 0.14)'
                    : 'rgba(143, 191, 211, 0.16)',
              border: `1px solid ${cfg.accent}`,
              color: cfg.accentLight,
              fontFamily: 'var(--font-mono)',
              fontSize: 10, fontWeight: 700,
              padding: '7px 16px',
              cursor: 'pointer',
              borderRadius: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)',
              letterSpacing: '0.22em', textTransform: 'uppercase',
              boxShadow: `0 0 12px ${cfg.glowAlpha}`,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = `0 0 22px ${cfg.glowAlpha}, 0 0 6px ${cfg.glowAlpha}`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = `0 0 12px ${cfg.glowAlpha}`
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

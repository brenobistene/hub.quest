/**
 * Modal de confirmação de backfill — abre quando a UI precisa perguntar se
 * deve aplicar uma regra recém-criada (ou existente) em transações antigas.
 *
 * Mostra contagem + amostra + opções: aplicar só nas sem categoria, aplicar
 * em todas (overwrite), ou pular.
 */
import { useState } from 'react'
import { X } from 'lucide-react'
import { applyBackfillRule, reportApiError } from '../../../api'
import type { FinRuleBackfillPreview } from '../../../api'
import {
  sectionLabel, primaryButton, ghostButton, modalOverlay,
  modalShell, modalHairline, modalHeader, modalBody,
} from './styleHelpers'

export function BackfillConfirmModal({
  ruleId, pattern, categoryName, preview, onClose, onApplied,
}: {
  ruleId: string
  pattern: string
  categoryName: string
  preview: FinRuleBackfillPreview
  onClose: () => void
  onApplied: (updated: number) => void
}) {
  const [busy, setBusy] = useState(false)
  const { matches_total, matches_uncategorized, sample } = preview
  const onlyAlreadyCategorized = matches_uncategorized === 0 && matches_total > 0

  async function apply(overwrite: boolean) {
    setBusy(true)
    try {
      const { updated } = await applyBackfillRule(ruleId, { overwrite })
      onApplied(updated)
    } catch (err) {
      reportApiError('BackfillConfirmModal.apply', err)
      alert('Erro ao aplicar — veja o console.')
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ ...modalOverlay(), zIndex: 110 }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...modalShell(),
        minWidth: 460, maxWidth: 560,
      }}>
        <div style={modalHairline} />
        <div style={modalHeader()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={sectionLabel()}>Aplicar regra a transações antigas?</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', padding: 4,
            display: 'inline-flex',
          }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        </div>
        <div style={modalBody()}>

        <div style={{
          padding: 12, marginBottom: 14,
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderLeft: '3px solid var(--color-accent-light)',
          borderRadius: 3, fontSize: 12, lineHeight: 1.6,
        }}>
          A regra <code style={codeStyle}>{pattern}</code> → <strong>{categoryName}</strong> bate
          com <strong>{matches_total}</strong> transação(ões) já lançada(s),
          das quais <strong>{matches_uncategorized}</strong> ainda
          {matches_uncategorized === 1 ? ' está' : ' estão'} sem categoria.
        </div>

        {sample.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 9, color: 'var(--color-text-tertiary)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontWeight: 600, marginBottom: 6,
            }}>
              Amostra ({sample.length} de {matches_uncategorized})
            </div>
            <ul style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {sample.map((d, i) => (
                <li key={i} style={{
                  fontSize: 11, color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  · {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} disabled={busy} style={ghostButton()}>
            pular
          </button>
          {matches_total > matches_uncategorized && (
            <button
              type="button"
              onClick={() => apply(true)}
              disabled={busy}
              title={`Reclassificar TODAS as ${matches_total} (incluindo as que já têm outra categoria)`}
              style={ghostButton()}
            >
              reclassificar todas ({matches_total})
            </button>
          )}
          {matches_uncategorized > 0 && (
            <button
              type="button"
              onClick={() => apply(false)}
              disabled={busy}
              style={primaryButton()}
            >
              {busy ? 'aplicando…' : `aplicar nas sem categoria (${matches_uncategorized})`}
            </button>
          )}
          {onlyAlreadyCategorized && (
            <div style={{
              fontSize: 11, color: 'var(--color-text-muted)',
              fontStyle: 'italic', alignSelf: 'center',
            }}>
              todas já têm categoria — nada a fazer.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  background: 'var(--color-bg-primary)',
  padding: '1px 6px', borderRadius: 2,
  border: '1px solid var(--color-border)',
  fontSize: 11,
}

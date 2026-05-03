import { useEffect, useMemo, useState } from 'react'
import {
  fetchAllFinParcelas, updateFinTransaction, createFinCategorizationRule,
  previewBackfillRule, reportApiError,
} from '../../../api'
import type { FinRuleBackfillPreview } from '../../../api'
import type { FinTransaction, FinCategory, FinDebt, FinParcela } from '../../../types'
import {
  sectionLabel, fieldLabel, inputStyle, primaryButton, ghostButton,
  formatBRL, formatDate,
} from './styleHelpers'
import { BackfillConfirmModal } from './BackfillConfirmModal'

export function CategorizeModal({ tx, categories, debts, onClose, onSaved }: {
  tx: FinTransaction
  categories: FinCategory[]
  debts: FinDebt[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEntry = tx.valor >= 0
  const filteredCats = useMemo(() => {
    if (isEntry) return categories.filter(c => c.tipo === 'receita' || c.tipo === 'estorno')
    return categories.filter(c => c.tipo === 'despesa')
  }, [categories, isEntry])
  const eligibleDebts = useMemo(
    () => (isEntry ? [] : debts.filter(d => d.status === 'active')),
    [debts, isEntry],
  )

  const [pendingParcelas, setPendingParcelas] = useState<FinParcela[]>([])
  useEffect(() => {
    if (!isEntry) return
    fetchAllFinParcelas('pendente')
      .then(setPendingParcelas)
      .catch(err => reportApiError('CategorizeModal.fetchParcelas', err))
  }, [isEntry])

  const [categoriaId, setCategoriaId] = useState<string>(tx.categoria_id ?? filteredCats[0]?.id ?? '')
  const [dividaId, setDividaId] = useState<string>(tx.divida_id ?? '')
  const [parcelaId, setParcelaId] = useState<string>(tx.parcela_id ?? '')
  const [createRule, setCreateRule] = useState(false)
  const [pattern, setPattern] = useState<string>(() => guessPattern(tx.descricao))
  const [busy, setBusy] = useState(false)
  const [backfillPrompt, setBackfillPrompt] = useState<{
    ruleId: string
    pattern: string
    categoryName: string
    preview: FinRuleBackfillPreview
  } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!categoriaId) { alert('Escolha uma categoria.'); return }
    setBusy(true)
    try {
      const patch: Partial<FinTransaction> = { categoria_id: categoriaId }
      if (!isEntry) patch.divida_id = dividaId || null
      if (isEntry) patch.parcela_id = parcelaId || null
      await updateFinTransaction(tx.id, patch)
      if (createRule && pattern.trim()) {
        const rule = await createFinCategorizationRule({
          pattern: pattern.trim(),
          categoria_id: categoriaId,
        })
        // Tenta backfill: se já houver outras transações sem categoria que
        // batem com a regra, oferece aplicar agora. A transação atual acabou
        // de ser categorizada manualmente, então não conta no preview.
        try {
          const preview = await previewBackfillRule(rule.id)
          if (preview.matches_uncategorized > 0 || preview.matches_total > 1) {
            const cat = filteredCats.find(c => c.id === categoriaId)
            setBackfillPrompt({
              ruleId: rule.id,
              pattern: pattern.trim(),
              categoryName: cat?.nome ?? '?',
              preview,
            })
            setBusy(false)
            return  // espera o user decidir antes de fechar
          }
        } catch (err) {
          reportApiError('CategorizeModal.previewBackfill', err)
          // Não bloqueia o fluxo principal — só loga.
        }
      }
      onSaved()
    } catch (err) {
      reportApiError('CategorizeModal.submit', err)
      alert('Erro ao salvar — veja o console.')
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 4, padding: 24, minWidth: 420, maxWidth: 520,
      }}>
        <div style={sectionLabel()}>Categorizar transação</div>

        <div style={{
          padding: 12, marginBottom: 16,
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderLeft: `3px solid ${isEntry ? 'var(--color-success)' : 'var(--color-accent-primary)'}`,
          borderRadius: 3,
        }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{tx.descricao}</div>
          <div style={{
            fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4,
            fontFamily: 'var(--font-mono)',
          }}>
            {formatDate(tx.data)} · {isEntry ? '+' : ''}{formatBRL(tx.valor)}
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={fieldLabel()}>Categoria</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} style={inputStyle()}>
              {filteredCats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {eligibleDebts.length > 0 && (
            <div>
              <label style={fieldLabel()}>Vincular a dívida (opcional)</label>
              <select value={dividaId} onChange={e => setDividaId(e.target.value)} style={inputStyle()}>
                <option value="">— não vincular —</option>
                {eligibleDebts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.descricao} (saldo {formatBRL(d.saldo_devedor)})
                  </option>
                ))}
              </select>
              <div style={hintStyle}>vincular abate o saldo da dívida quando essa transação é uma saída.</div>
            </div>
          )}

          {isEntry && pendingParcelas.length > 0 && (
            <div>
              <label style={fieldLabel()}>Vincular a parcela esperada (opcional)</label>
              <select value={parcelaId} onChange={e => setParcelaId(e.target.value)} style={inputStyle()}>
                <option value="">— não vincular —</option>
                {pendingParcelas.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.projeto_titulo} — Parcela #{p.numero} ({formatBRL(p.valor)}{p.data_prevista ? `, vence ${formatDate(p.data_prevista)}` : ''})
                  </option>
                ))}
              </select>
              <div style={hintStyle}>vincular marca a parcela como "recebida" e contabiliza no R$/hora real do projeto.</div>
            </div>
          )}

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            cursor: 'pointer', padding: '8px 0',
          }}>
            <input
              type="checkbox"
              checked={createRule}
              onChange={e => setCreateRule(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--color-accent-primary)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                criar regra automática
              </div>
              <div style={{ color: 'var(--color-text-muted)' }}>
                próximas transações cuja descrição contenha esse texto serão
                categorizadas automaticamente nessa categoria.
              </div>
            </div>
          </label>

          {createRule && (
            <div>
              <label style={fieldLabel()}>Texto da regra</label>
              <input
                type="text"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                placeholder="ex: ifood, amicom, uber"
                style={inputStyle()}
              />
              <div style={hintStyle}>
                comparação é case-insensitive — "iFood" combina com "iFood",
                "IFOOD", "ifood almoço", etc.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={ghostButton()}>cancelar</button>
            <button type="submit" disabled={busy} style={primaryButton()}>
              {busy ? 'salvando…' : 'salvar'}
            </button>
          </div>
        </form>
      </div>

      {backfillPrompt && (
        <BackfillConfirmModal
          ruleId={backfillPrompt.ruleId}
          pattern={backfillPrompt.pattern}
          categoryName={backfillPrompt.categoryName}
          preview={backfillPrompt.preview}
          onClose={() => { setBackfillPrompt(null); onSaved() }}
          onApplied={() => { setBackfillPrompt(null); onSaved() }}
        />
      )}
    </div>
  )
}

const hintStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--color-text-muted)', marginTop: 4, fontStyle: 'italic',
}

/** Heurística pra propor pattern de regra: primeira palavra com 3+ chars
 *  que não seja preposição/stopword. Usuário ajusta no input. */
function guessPattern(descricao: string): string {
  const stopWords = new Set([
    'de', 'da', 'do', 'das', 'dos', 'na', 'no', 'em', 'para',
    'pra', 'compra', 'pix', 'transferencia', 'transferência', 'pagamento',
  ])
  const words = (descricao || '').split(/\s+/).filter(Boolean)
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^\wÀ-ÿ]/g, '')
    if (clean.length >= 3 && !stopWords.has(clean)) return w
  }
  return words[0] ?? ''
}

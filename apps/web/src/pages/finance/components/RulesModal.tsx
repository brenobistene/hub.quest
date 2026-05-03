import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Wand2, X } from 'lucide-react'
import {
  fetchFinCategorizationRules, updateFinCategorizationRule,
  deleteFinCategorizationRule, previewBackfillRule, reportApiError,
} from '../../../api'
import type { FinRuleBackfillPreview } from '../../../api'
import type { FinCategory, FinCategorizationRule } from '../../../types'
import { sectionLabel, inputStyle, primaryButton, modalOverlay } from './styleHelpers'
import { BackfillConfirmModal } from './BackfillConfirmModal'

export function RulesModal({ categories, onClose }: {
  categories: FinCategory[]
  onClose: () => void
}) {
  const [rules, setRules] = useState<FinCategorizationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftPattern, setDraftPattern] = useState('')
  const [draftCategoriaId, setDraftCategoriaId] = useState('')
  const [busy, setBusy] = useState(false)
  const [backfillPrompt, setBackfillPrompt] = useState<{
    ruleId: string
    pattern: string
    categoryName: string
    preview: FinRuleBackfillPreview
  } | null>(null)

  async function handleBackfill(r: FinCategorizationRule) {
    setBusy(true)
    try {
      const preview = await previewBackfillRule(r.id)
      const cat = catById.get(r.categoria_id)
      if (preview.matches_total === 0) {
        alert('Nenhuma transação lançada bate com esse pattern.')
        return
      }
      setBackfillPrompt({
        ruleId: r.id,
        pattern: r.pattern,
        categoryName: cat?.nome ?? '?',
        preview,
      })
    } catch (err) {
      reportApiError('RulesModal.previewBackfill', err)
      alert('Erro ao consultar — veja o console.')
    } finally {
      setBusy(false)
    }
  }

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  function refresh() {
    setLoading(true)
    fetchFinCategorizationRules()
      .then(setRules)
      .catch(err => reportApiError('RulesModal.fetch', err))
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  function startEdit(r: FinCategorizationRule) {
    setEditingId(r.id)
    setDraftPattern(r.pattern)
    setDraftCategoriaId(r.categoria_id)
  }
  function cancelEdit() {
    setEditingId(null)
    setDraftPattern(''); setDraftCategoriaId('')
  }

  async function saveEdit(r: FinCategorizationRule) {
    if (!draftPattern.trim()) { alert('Pattern não pode ser vazio.'); return }
    if (!draftCategoriaId) { alert('Escolha uma categoria.'); return }
    setBusy(true)
    try {
      await updateFinCategorizationRule(r.id, {
        pattern: draftPattern.trim(),
        categoria_id: draftCategoriaId,
      })
      cancelEdit()
      refresh()
    } catch (err) {
      reportApiError('RulesModal.save', err)
      alert('Erro ao salvar — veja o console.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(r: FinCategorizationRule) {
    const cat = catById.get(r.categoria_id)
    if (!window.confirm(
      `Deletar regra "${r.pattern}" → ${cat?.nome ?? '?'}? ` +
      `Transações já categorizadas continuam categorizadas, só não vai mais ` +
      `auto-categorizar futuras.`
    )) return
    setBusy(true)
    try {
      await deleteFinCategorizationRule(r.id)
      refresh()
    } catch (err) {
      reportApiError('RulesModal.delete', err)
      alert('Erro ao deletar — veja o console.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={modalOverlay()}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 4, padding: 24,
        minWidth: 560, maxWidth: 720, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <div style={sectionLabel()}>Regras de auto-categorização</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', padding: 4,
            display: 'inline-flex',
          }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div style={{
          fontSize: 11, color: 'var(--color-text-muted)',
          marginBottom: 14, lineHeight: 1.5,
        }}>
          Cada regra mapeia um <strong>texto na descrição</strong> (case-insensitive)
          pra uma categoria. Quando uma nova transação chega (manual, import CSV)
          e a descrição contém o texto, sistema categoriza automático. Pra criar
          nova regra, use o botão "categorizar" numa transação e marque "criar
          regra automática".
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            carregando…
          </div>
        ) : rules.length === 0 ? (
          <div style={{
            padding: '20px 16px',
            border: '1px dashed var(--color-border)', borderRadius: 4,
            textAlign: 'center', color: 'var(--color-text-muted)',
            fontSize: 11, fontStyle: 'italic',
          }}>
            nenhuma regra cadastrada ainda. categorize uma transação e marque
            "criar regra automática" no modal.
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            overflowY: 'auto', flex: 1,
          }}>
            {rules.map(r => {
              const cat = catById.get(r.categoria_id)
              const isEditing = editingId === r.id
              return (
                <div key={r.id} style={{
                  display: 'grid',
                  gridTemplateColumns: isEditing ? '1fr 180px auto' : '1fr 180px 70px auto',
                  gap: 8, alignItems: 'center',
                  padding: '8px 10px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderLeft: '3px solid var(--color-accent-light)',
                  borderRadius: 3,
                }}>
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={draftPattern}
                        onChange={e => setDraftPattern(e.target.value)}
                        autoFocus
                        style={inputStyle()}
                      />
                      <select
                        value={draftCategoriaId}
                        onChange={e => setDraftCategoriaId(e.target.value)}
                        style={inputStyle()}
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => saveEdit(r)}
                          disabled={busy}
                          style={{ ...primaryButton(), fontSize: 9, padding: '5px 10px' }}
                        >
                          salvar
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={busy}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-tertiary)', padding: 4,
                            display: 'inline-flex', alignItems: 'center',
                          }}
                        >
                          <X size={12} strokeWidth={1.8} />
                        </button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{
                        fontSize: 13, color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.pattern}
                      </span>
                      <span style={{
                        fontSize: 11, color: 'var(--color-text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        → {cat?.nome ?? '(categoria removida)'}
                      </span>
                      <span
                        title={`bateu ${r.times_matched} vez${r.times_matched === 1 ? '' : 'es'}`}
                        style={{
                          fontSize: 10, color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          textAlign: 'right',
                        }}
                      >
                        ×{r.times_matched}
                      </span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => handleBackfill(r)}
                          disabled={busy}
                          title="aplicar essa regra a transações antigas (backfill)"
                          style={iconBtn('var(--color-accent-light)')}
                        >
                          <Wand2 size={12} strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={() => startEdit(r)}
                          title="editar"
                          style={iconBtn('var(--color-accent-light)')}
                        >
                          <Pencil size={12} strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          title="deletar"
                          style={iconBtn('var(--color-accent-primary)')}
                        >
                          <Trash2 size={12} strokeWidth={1.8} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{
          marginTop: 16, fontSize: 10, color: 'var(--color-text-muted)',
          fontStyle: 'italic',
        }}>
          ×N = quantas vezes essa regra já casou e categorizou automaticamente.
          O ícone de varinha aplica a regra retroativamente em transações já lançadas.
        </div>
      </div>

      {backfillPrompt && (
        <BackfillConfirmModal
          ruleId={backfillPrompt.ruleId}
          pattern={backfillPrompt.pattern}
          categoryName={backfillPrompt.categoryName}
          preview={backfillPrompt.preview}
          onClose={() => setBackfillPrompt(null)}
          onApplied={() => { setBackfillPrompt(null); refresh() }}
        />
      )}
    </div>
  )
}

function iconBtn(hoverColor: string): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-text-tertiary)', padding: 4,
    display: 'inline-flex', alignItems: 'center',
    transition: 'color 0.15s',
    // hover via inline mouseEnter/Leave seria melhor, mas pra MVP isso já funciona;
    // estilo se vê no hover via uso de :hover-friendly browsers (não-Edge).
    ['--hover-color' as any]: hoverColor,
  }
}

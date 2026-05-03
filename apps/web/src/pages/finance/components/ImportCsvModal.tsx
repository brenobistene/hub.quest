import { useRef, useState } from 'react'
import { importNubankCsv, reportApiError } from '../../../api'
import type { FinAccount, FinImportSummary } from '../../../types'
import { sectionLabel, fieldLabel, inputStyle, primaryButton, ghostButton } from './styleHelpers'

export function ImportCsvModal({ accounts, onClose, onImported }: {
  accounts: FinAccount[]
  onClose: () => void
  onImported: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [contaId, setContaId] = useState(accounts[0]?.id ?? '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FinImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Selecione um arquivo CSV.'); return }
    if (!contaId) { setError('Selecione a conta de destino.'); return }
    setBusy(true)
    try {
      const summary = await importNubankCsv(file, contaId)
      setResult(summary)
    } catch (err: any) {
      reportApiError('importNubankCsv', err)
      setError(err?.message ?? 'Erro ao importar — veja o console (F12).')
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    if (result && result.imported > 0) onImported()
    else onClose()
  }

  return (
    <div onClick={handleClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 4, padding: 24, minWidth: 460, maxWidth: 560,
      }}>
        <div style={sectionLabel()}>Importar CSV do Nubank</div>

        <div style={{
          fontSize: 11, color: 'var(--color-text-muted)',
          marginBottom: 16, lineHeight: 1.5,
        }}>
          Exporte o extrato da sua conta corrente Nubank (formato CSV) pelo app
          ou site. Suporta o cabeçalho padrão: <em>Data, Valor, Identificador,
          Descrição</em>. Re-importar o mesmo arquivo é seguro — duplicatas
          são detectadas e ignoradas.
        </div>

        {!result && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={fieldLabel()}>Conta de destino</label>
              <select value={contaId} onChange={e => setContaId(e.target.value)} style={inputStyle()}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nome} ({a.tipo})</option>)}
              </select>
            </div>
            <div>
              <label style={fieldLabel()}>Arquivo CSV</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={() => setFileName(fileRef.current?.files?.[0]?.name ?? null)}
                style={{ ...inputStyle(), padding: '6px 8px' }}
              />
              {fileName && (
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {fileName}
                </div>
              )}
            </div>
            {error && (
              <div style={{
                fontSize: 11, color: 'var(--color-accent-primary)',
                padding: 10, background: 'rgba(232, 93, 58, 0.08)',
                border: '1px solid var(--color-accent-primary)', borderRadius: 3,
              }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={handleClose} style={ghostButton()}>cancelar</button>
              <button type="submit" disabled={busy} style={primaryButton()}>
                {busy ? 'importando…' : 'importar'}
              </button>
            </div>
          </form>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: 14, borderRadius: 3,
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}>
              <SummaryRow label="Importadas" value={result.imported} color="var(--color-success)" />
              {result.auto_categorized > 0 && (
                <SummaryRow label="Auto-categorizadas" value={result.auto_categorized} color="var(--color-accent-light)" />
              )}
              {result.auto_linked_parcelas > 0 && (
                <SummaryRow label="Auto-vinculadas a parcelas" value={result.auto_linked_parcelas} color="var(--color-accent-light)" />
              )}
              <SummaryRow label="Duplicadas (ignoradas)" value={result.duplicates} color="var(--color-text-secondary)" />
              <SummaryRow label="Erros" value={result.errors} color={result.errors > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)'} last />
            </div>
            {result.error_samples.length > 0 && (
              <div style={{
                fontSize: 10, color: 'var(--color-text-muted)',
                padding: 10, background: 'rgba(232, 93, 58, 0.05)',
                border: '1px solid var(--color-border)', borderRadius: 3,
                fontFamily: 'var(--font-mono)',
              }}>
                <div style={{ marginBottom: 6, color: 'var(--color-accent-primary)' }}>
                  Linhas com erro (primeiras 5):
                </div>
                {result.error_samples.map((s, i) => <div key={i}>· {s}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleClose} style={primaryButton()}>fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value, color, last }: {
  label: string; value: number; color: string; last?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      marginBottom: last ? 0 : 8,
    }}>
      <span style={{
        fontSize: 11, color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 14, fontWeight: 700, color,
        fontFamily: 'var(--font-mono)',
      }}>
        {value}
      </span>
    </div>
  )
}

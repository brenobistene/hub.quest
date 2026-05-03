/**
 * Lançamentos — lista mensal de transações estilo Organizze (mas dark tactical).
 *
 * Layout:
 * - Header: título + seletor de mês central + botão menu
 * - Barra de busca/filtros: input de busca + botão filtros (expande dropdowns)
 * - Lista: cards de transação com edit/delete inline
 * - Rodapé: totais do mês (receita/despesa/saldo) + botão "+" pra lançar
 *
 * Ações:
 * - Click categoria → CategorizeModal (categorização rápida + criar regra)
 * - Pencil → TransactionEditModal (edição completa)
 * - "+" → NewTransactionModal
 */
import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Download, Filter, Link2, MoreVertical, Pencil, Plus,
  Search, Sparkles, Trash2, X,
} from 'lucide-react'
import { useHubFinance } from './HubFinanceContext'
import {
  buildFinExportTransactionsUrl, deleteFinTransaction, reportApiError,
} from '../../api'
import type { FinTransaction } from '../../types'
import {
  formatBRL, formatDate, inputStyle,
} from './components/styleHelpers'
import { CategorizeModal } from './components/CategorizeModal'
import { TransactionEditModal } from './components/TransactionEditModal'
import { NewTransactionModal } from './components/NewTransactionModal'

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function LancamentosPage() {
  const {
    transactions, accounts, categories, debts, monthlySummary,
    selectedMonth, setSelectedMonth, refreshAll,
  } = useHubFinance()

  // Modais
  const [categorizingTx, setCategorizingTx] = useState<FinTransaction | null>(null)
  const [editingTx, setEditingTx] = useState<FinTransaction | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  // Filtros (client-side, lista do mês já tá carregada via context)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCatId, setFilterCatId] = useState('')
  const [filterContaId, setFilterContaId] = useState('')
  const [filterTipo, setFilterTipo] = useState<'all' | 'entrada' | 'saida'>('all')

  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions.filter(tx => {
      if (q && !tx.descricao.toLowerCase().includes(q)) return false
      if (filterCatId && tx.categoria_id !== filterCatId) return false
      if (filterContaId && tx.conta_id !== filterContaId) return false
      if (filterTipo === 'entrada' && tx.valor < 0) return false
      if (filterTipo === 'saida' && tx.valor >= 0) return false
      return true
    })
  }, [transactions, search, filterCatId, filterContaId, filterTipo])

  const hasFilters = !!(search || filterCatId || filterContaId || filterTipo !== 'all')

  function clearFilters() {
    setSearch(''); setFilterCatId(''); setFilterContaId(''); setFilterTipo('all')
    setFiltersOpen(false)
  }

  async function handleDelete(tx: FinTransaction) {
    if (!window.confirm(`Deletar transação "${tx.descricao}"?`)) return
    try {
      await deleteFinTransaction(tx.id)
      refreshAll()
    } catch (err) {
      reportApiError('deleteFinTransaction', err)
      alert('Erro ao deletar — veja o console.')
    }
  }

  const monthLabel = `${MONTH_NAMES_PT[selectedMonth.month - 1]} ${selectedMonth.year}`

  // Default da data nova transação = primeiro dia do mês selecionado.
  // Facilita lançar retroativamente quando o user navega meses passados.
  const defaultDate = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}-01`

  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      display: 'flex', flexDirection: 'column',
      minHeight: 'calc(100vh - 200px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
        padding: '14px 18px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)',
        }}>
          Lançamentos
        </div>

        {/* Seletor de mês central */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
            style={iconBtnStyle}
            title="mês anterior"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: 'var(--color-text-primary)',
            minWidth: 130, textAlign: 'center',
            textTransform: 'capitalize',
            fontFamily: 'var(--font-mono)',
          }}>
            {monthLabel}
          </span>
          <button
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
            style={iconBtnStyle}
            title="próximo mês"
          >
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Menu (placeholder por enquanto) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={iconBtnStyle}
            title="mais opções (em breve)"
            disabled
          >
            <MoreVertical size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Barra de busca + filtros */}
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 3, padding: '6px 12px',
        }}>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            title={filtersOpen ? 'esconder filtros' : 'mostrar filtros'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: filtersOpen || hasFilters ? 'var(--color-accent-light)' : 'var(--color-text-muted)',
              padding: 0, display: 'inline-flex',
            }}
          >
            <Filter size={13} strokeWidth={2} />
          </button>
          <input
            type="text"
            placeholder="filtrar por descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)', fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              title="limpar filtros"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: 0, display: 'inline-flex',
              }}
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
          <Search size={13} strokeWidth={2} style={{ color: 'var(--color-text-muted)' }} />
        </div>

        {filtersOpen && (
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr 1fr',
            gap: 8, alignItems: 'center',
          }}>
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as any)} style={inputStyle()}>
              <option value="all">tipo: todos</option>
              <option value="entrada">entradas</option>
              <option value="saida">saídas</option>
            </select>
            <select value={filterContaId} onChange={e => setFilterContaId(e.target.value)} style={inputStyle()}>
              <option value="">contas: todas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <select value={filterCatId} onChange={e => setFilterCatId(e.target.value)} style={inputStyle()}>
              <option value="">categorias: todas</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}

        {hasFilters && (
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            mostrando {filtered.length} de {transactions.length} transações
          </div>
        )}
      </div>

      {/* Lista de transações */}
      <div style={{ flex: 1, padding: '12px 18px', overflowY: 'auto' }}>
        {transactions.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={26} strokeWidth={1.5} />}
            text="Nenhuma movimentação no período."
            sub="Use o + abaixo pra lançar uma transação."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={26} strokeWidth={1.5} />}
            text="Nenhuma transação bate com os filtros."
            sub="Ajuste a busca ou limpe os filtros."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(tx => {
              const isEntry = tx.valor >= 0
              const cat = tx.categoria_id ? catById.get(tx.categoria_id) : null
              const acc = accountById.get(tx.conta_id)
              return (
                <div key={tx.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 1fr 140px 130px auto',
                  gap: 12, alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border)',
                  borderLeft: `3px solid ${isEntry ? 'var(--color-success)' : 'var(--color-accent-primary)'}`,
                  borderRadius: 3,
                }}>
                  <span style={{
                    fontSize: 10, color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {formatDate(tx.data)}
                  </span>
                  <span style={{
                    fontSize: 13, color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {(tx.parcela_id || tx.divida_id || tx.fatura_id) && (
                      <span
                        title={
                          tx.parcela_id ? 'vinculada a parcela de projeto' :
                          tx.divida_id ? 'vinculada a dívida' :
                          'parte de fatura de cartão'
                        }
                        style={{ display: 'inline-flex', flexShrink: 0 }}
                      >
                        <Link2
                          size={11}
                          strokeWidth={1.8}
                          style={{ color: 'var(--color-accent-light)' }}
                        />
                      </span>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.descricao}
                    </span>
                  </span>
                  {cat ? (
                    <span
                      onClick={() => setCategorizingTx(tx)}
                      title="alterar categoria"
                      style={{
                        fontSize: 10, color: 'var(--color-text-tertiary)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        cursor: 'pointer', transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-accent-light)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                    >
                      {cat.nome}
                    </span>
                  ) : (
                    <button
                      onClick={() => setCategorizingTx(tx)}
                      title="categorizar"
                      style={{
                        background: 'none', border: '1px dashed var(--color-border)',
                        cursor: 'pointer', borderRadius: 3,
                        color: 'var(--color-text-muted)',
                        padding: '3px 8px', fontSize: 9,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = 'var(--color-accent-light)'
                        e.currentTarget.style.borderColor = 'var(--color-accent-light)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--color-text-muted)'
                        e.currentTarget.style.borderColor = 'var(--color-border)'
                      }}
                    >
                      <Sparkles size={9} strokeWidth={2} />
                      categorizar
                    </button>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    {acc?.nome ?? '—'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: isEntry ? 'var(--color-success)' : 'var(--color-accent-primary)',
                    }}>
                      {isEntry ? '+' : ''}{formatBRL(tx.valor)}
                    </span>
                    <button
                      onClick={() => setEditingTx(tx)}
                      title="editar"
                      style={iconBtnStyle}
                    >
                      <Pencil size={11} strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => handleDelete(tx)}
                      title="deletar"
                      style={iconBtnStyle}
                    >
                      <Trash2 size={11} strokeWidth={1.8} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Rodapé com totais + botões export e "+" */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16, alignItems: 'center',
        padding: '14px 18px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg-primary)',
      }}>
        <a
          href={buildFinExportTransactionsUrl({
            data_de: `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}-01`,
            data_ate: (() => {
              const lastDay = new Date(selectedMonth.year, selectedMonth.month, 0).getDate()
              return `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
            })(),
          })}
          title={`exportar transações de ${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')} em CSV`}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: 3,
            color: 'var(--color-text-tertiary)',
            padding: '6px 10px',
            fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            textDecoration: 'none',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-text-secondary)'
            e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          <Download size={11} strokeWidth={2} />
          exportar CSV
        </a>
        <div />
        <div style={{ display: 'flex', gap: 24, fontSize: 11 }}>
          <FooterStat label="Receita" value={monthlySummary?.receita ?? 0} color="var(--color-success)" />
          <FooterStat label="Despesa" value={monthlySummary?.despesa ?? 0} color="var(--color-accent-primary)" />
          <FooterStat
            label="Saldo do mês"
            value={monthlySummary?.sobra ?? 0}
            color={(monthlySummary?.sobra ?? 0) >= 0 ? 'var(--color-text-primary)' : 'var(--color-accent-primary)'}
            bold
          />
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          title="novo lançamento"
          style={{
            background: 'var(--color-accent-primary)',
            border: 'none', cursor: 'pointer',
            color: 'var(--color-bg-primary)',
            width: 36, height: 36, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <Plus size={18} strokeWidth={2.2} />
        </button>
      </div>

      {/* Modais */}
      {categorizingTx && (
        <CategorizeModal
          tx={categorizingTx}
          categories={categories}
          debts={debts}
          onClose={() => setCategorizingTx(null)}
          onSaved={() => { setCategorizingTx(null); refreshAll() }}
        />
      )}
      {editingTx && (
        <TransactionEditModal
          tx={editingTx}
          accounts={accounts}
          categories={categories}
          debts={debts}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); refreshAll() }}
        />
      )}
      {showNewModal && (
        <NewTransactionModal
          accounts={accounts}
          categories={categories}
          defaultDate={defaultDate}
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); refreshAll() }}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes locais ──────────────────────────────────────────────

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px',
      color: 'var(--color-text-muted)',
    }}>
      <div style={{ marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{text}</div>
      <div style={{ fontSize: 10, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

function FooterStat({ label, value, color, bold }: {
  label: string; value: number; color: string; bold?: boolean
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{
        fontSize: 9, color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, fontWeight: bold ? 700 : 600, color,
        fontFamily: 'var(--font-mono)',
      }}>
        {formatBRL(value)}
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function shiftMonth(current: { year: number; month: number }, delta: number) {
  const d = new Date(current.year, current.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-tertiary)', padding: 4,
  display: 'inline-flex', alignItems: 'center',
  borderRadius: 3, transition: 'color 0.15s',
}

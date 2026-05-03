/**
 * Visão Geral — dashboard inicial do Hub Finance.
 *
 * Layout 2 colunas (estilo Organizze, mas dark tactical). Esquerda foca em
 * fluxo de caixa (saldo + contas + contas a pagar/receber). Direita foca em
 * crédito + análise (faturas + cartões + maiores gastos).
 *
 * Cards são compactos com link "ver tudo" pra sub-página correspondente.
 */
import { useMemo, useEffect, useState } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, Landmark, Pencil, Wallet } from 'lucide-react'
import { useHubFinance } from './HubFinanceContext'
import {
  formatBRL, formatMoney, ICON_SIZE, ICON_STROKE,
} from './components/styleHelpers'
import { Card, IconButton, EmptyState } from '../../components/ui/Primitives'
import { InvoicesManagerModal } from './components/InvoicesManagerModal'
import { DebtsManagerModal } from './components/DebtsManagerModal'
import { ExchangeRateModal } from './components/ExchangeRateModal'
import { AccountManagerModal } from './components/AccountManagerModal'
import type { FinAccount, FinDebt, FinInvoice, FinParcela, FinTransaction } from '../../types'
import { fetchAllFinParcelas, reportApiError } from '../../api'

export function VisaoGeralPage() {
  const {
    accounts, summary, monthlySummary, transactions, categories,
    debts, invoices, budget, selectedMonth, setSelectedMonth, loading,
    refreshAll,
  } = useHubFinance()

  // Busca parcelas pendentes (todas) — pra "contas a receber"
  const [pendingParcelas, setPendingParcelas] = useState<FinParcela[]>([])
  useEffect(() => {
    fetchAllFinParcelas('pendente')
      .then(setPendingParcelas)
      .catch(err => reportApiError('VisaoGeral.fetchParcelas', err))
  }, [])

  // Modal de gerenciamento de faturas (substituiu a aba "Cartões")
  const [showInvoicesManager, setShowInvoicesManager] = useState(false)
  // Modal de gerenciamento de dívidas (substituiu a aba "Dívidas")
  const [showDebtsManager, setShowDebtsManager] = useState(false)
  // Modal de gerenciamento de contas (rename/delete/reorder/conciliar)
  const [showAccountsManager, setShowAccountsManager] = useState(false)
  // Modal de edição de cotação (USD/EUR/etc → BRL)
  const [editingRateAccount, setEditingRateAccount] = useState<FinAccount | null>(null)

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>
  if (accounts.length === 0) return <NoAccountsState />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header: saudação + receita/despesa do mês */}
      <Greeting
        monthlySummary={monthlySummary}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
      />

      {/* Linha 1: Saldo geral (esquerda) + Faturas (direita) */}
      <div style={twoColumns}>
        <CardSaldoGeral
          summary={summary}
          accounts={accounts}
          onEditRate={setEditingRateAccount}
          onManage={() => setShowAccountsManager(true)}
        />
        <CardFaturas
          invoices={invoices}
          accounts={accounts}
          onManage={() => setShowInvoicesManager(true)}
        />
      </div>

      {/* Linha 2: Contas a pagar (esquerda) + Maiores gastos (direita) */}
      <div style={twoColumns}>
        <CardContasAPagar debts={debts} invoices={invoices} accounts={accounts} />
        <CardMaioresGastos
          transactions={transactions}
          categories={categories}
        />
      </div>

      {/* Linha 3: Contas a receber (esquerda) + Orçamento (direita) */}
      <div style={twoColumns}>
        <CardContasAReceber parcelas={pendingParcelas} />
        <CardOrcamento budget={budget} />
      </div>

      {/* Linha 4: Dívidas (full-width) — destaque emocional */}
      <CardDividas
        debts={debts}
        onManage={() => setShowDebtsManager(true)}
      />

      {showInvoicesManager && (
        <InvoicesManagerModal
          invoices={invoices}
          accounts={accounts}
          onClose={() => setShowInvoicesManager(false)}
          onChanged={refreshAll}
        />
      )}

      {showDebtsManager && (
        <DebtsManagerModal
          categories={categories}
          onClose={() => setShowDebtsManager(false)}
          onChanged={refreshAll}
        />
      )}

      {editingRateAccount && (
        <ExchangeRateModal
          account={editingRateAccount}
          onClose={() => setEditingRateAccount(null)}
          onSaved={() => { setEditingRateAccount(null); refreshAll() }}
        />
      )}

      {showAccountsManager && (
        <AccountManagerModal
          accounts={accounts}
          onClose={() => setShowAccountsManager(false)}
          onChanged={refreshAll}
        />
      )}
    </div>
  )
}

// ─── Layout helper ───────────────────────────────────────────────────────

const twoColumns: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
  gap: 16,
}

// ─── Cards individuais ───────────────────────────────────────────────────

function Greeting({ monthlySummary, selectedMonth, onMonthChange }: {
  monthlySummary: ReturnType<typeof useHubFinance>['monthlySummary']
  selectedMonth: ReturnType<typeof useHubFinance>['selectedMonth']
  onMonthChange: ReturnType<typeof useHubFinance>['setSelectedMonth']
}) {
  const hour = new Date().getHours()
  const saudacao = hour < 6 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const monthLabel = formatMonthLabel(selectedMonth.year, selectedMonth.month)
  return (
    <div style={cardBase}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: 24, alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em' }}>
            {saudacao},
          </div>
          <div style={{
            fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)',
            marginTop: 2,
          }}>
            Breno
          </div>
        </div>

        {/* Receita / despesa do mês */}
        <div style={{ display: 'flex', gap: 24 }}>
          <Stat label="Receitas" value={monthlySummary?.receita ?? 0} color="var(--color-success)" />
          <Stat label="Despesas" value={monthlySummary?.despesa ?? 0} color="var(--color-accent-primary)" />
          <Stat label="Sobra" value={monthlySummary?.sobra ?? 0}
            color={(monthlySummary?.sobra ?? 0) >= 0 ? 'var(--color-text-primary)' : 'var(--color-accent-primary)'} />
        </div>

        {/* Seletor de mês */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--color-bg-secondary)',
          padding: '6px 8px', borderRadius: 3,
          border: '1px solid var(--color-border)',
        }}>
          <button
            onClick={() => onMonthChange(shiftMonth(selectedMonth, -1))}
            style={iconBtn}
            title="mês anterior"
          >
            <ChevronLeft size={13} strokeWidth={2} />
          </button>
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-primary)', minWidth: 110, textAlign: 'center',
            textTransform: 'capitalize',
          }}>
            {monthLabel}
          </span>
          <button
            onClick={() => onMonthChange(shiftMonth(selectedMonth, 1))}
            style={iconBtn}
            title="próximo mês"
          >
            <ChevronRight size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: 'var(--color-text-tertiary)',
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, color,
        fontFamily: 'var(--font-mono)',
      }}>
        {formatBRL(value)}
      </div>
    </div>
  )
}

function CardSaldoGeral({ summary, accounts, onEditRate, onManage }: {
  summary: ReturnType<typeof useHubFinance>['summary']
  accounts: FinAccount[]
  onEditRate: (acc: FinAccount) => void
  onManage: () => void
}) {
  const cotacoes = summary?.cotacoes_usadas ?? {}
  const naoConvertidas = summary?.saldos_nao_convertidos ?? []
  const moedasConvertidas = useMemo(() => {
    return Object.entries(cotacoes).map(([moeda, rate]) => ({
      moeda,
      rate,
      brl: summary?.saldos_convertidos_por_moeda?.[moeda] ?? 0,
      nativo: summary?.saldos_por_moeda?.[moeda] ?? 0,
    }))
  }, [summary, cotacoes])

  return (
    <Card padding="none" style={{
      animation: 'hq-fade-up var(--motion-base) var(--ease-emphasis) both',
      overflow: 'hidden',
    }}>
      {/* Header com gradient sutil — mancha oxblood top-left, vibe mórbida */}
      <div style={{
        padding: 'var(--space-5) var(--space-5) var(--space-4)',
        background: `
          radial-gradient(ellipse 100% 80% at 0% 0%, rgba(159, 18, 57, 0.08), transparent 60%),
          linear-gradient(180deg, rgba(236, 232, 227, 0.02), transparent)
        `,
        borderBottom: '1px solid var(--color-divider)',
        position: 'relative',
      }}>
        {/* Hairline accent — linha sutil vermelha no topo */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, var(--color-accent-primary), transparent)',
          opacity: 0.5,
        }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 'var(--space-2)',
        }}>
          <Wallet size={ICON_SIZE.xs} strokeWidth={ICON_STROKE} />
          Saldo geral
        </div>
        <div style={{
          fontSize: 'var(--text-3xl)',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: (summary?.saldo_total ?? 0) < 0
            ? 'var(--color-accent-light)'
            : 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>
          {formatBRL(summary?.saldo_total ?? 0)}
        </div>

        {moedasConvertidas.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-3)',
            flexWrap: 'wrap',
          }}>
            {moedasConvertidas.map(({ moeda, rate, nativo }) => (
              <span
                key={moeda}
                title={`${moeda} convertido a R$${rate.toFixed(4)}/${moeda}`}
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary)',
                  padding: '4px var(--space-2)',
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-pill)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ color: 'var(--color-accent-light)', fontWeight: 600 }}>{moeda}</span>
                {formatMoney(nativo, moeda)}
                <span style={{ color: 'var(--color-text-muted)' }}>· {rate.toFixed(2)}</span>
              </span>
            ))}
          </div>
        )}

        {naoConvertidas.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-error)',
          }}>
            <AlertCircle size={ICON_SIZE.xs} strokeWidth={ICON_STROKE} />
            <span>
              {naoConvertidas.length} conta{naoConvertidas.length === 1 ? '' : 's'} sem cotação —
              não soma{naoConvertidas.length === 1 ? '' : 'm'} no total. Defina pra incluir.
            </span>
          </div>
        )}
      </div>

      {/* Lista de contas */}
      <div style={{ padding: 'var(--space-4) var(--space-5) var(--space-3)' }}>
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 'var(--space-3)',
        }}>
          Minhas contas
        </div>

        {accounts.length === 0 ? (
          <EmptyState text="Adicione sua primeira conta" dense />
        ) : (
          <div className="hq-stagger" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}>
            {accounts.slice(0, 4).map((a, i) => {
              const isForeign = a.moeda !== 'BRL'
              const brlEquiv = isForeign && a.cotacao_brl ? a.saldo * a.cotacao_brl : null
              return (
                <div
                  key={a.id}
                  className="hq-row-hoverable hq-animate-fade-up"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    ['--stagger-i' as any]: i,
                  }}
                >
                  <span style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}>
                    <span style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {a.nome}
                    </span>
                    {isForeign && (
                      <IconButton
                        label={a.cotacao_brl
                          ? `editar cotação (R$${a.cotacao_brl.toFixed(2)}/${a.moeda})`
                          : 'definir cotação'}
                        onClick={() => onEditRate(a)}
                        variant={a.cotacao_brl ? 'default' : 'danger'}
                      >
                        {a.cotacao_brl
                          ? <Pencil size={ICON_SIZE.xs} strokeWidth={ICON_STROKE} />
                          : <AlertCircle size={ICON_SIZE.xs} strokeWidth={ICON_STROKE} />}
                      </IconButton>
                    )}
                  </span>
                  <span style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}>
                    <span style={{
                      fontSize: 'var(--text-base)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      color: a.saldo < 0
                        ? 'var(--color-error)'
                        : 'var(--color-text-primary)',
                    }}>
                      {formatMoney(a.saldo, a.moeda)}
                    </span>
                    {brlEquiv !== null && (
                      <span style={{
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--color-text-muted)',
                      }}>
                        ≈ {formatBRL(brlEquiv)}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
            {accounts.length > 4 && (
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                marginTop: 'var(--space-2)',
                fontStyle: 'italic',
              }}>
                + {accounts.length - 4} conta{accounts.length - 4 === 1 ? '' : 's'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer ação */}
      <button
        onClick={onManage}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          borderTop: '1px solid var(--color-divider)',
          padding: 'var(--space-3) var(--space-5)',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--glass-bg-hover)'
          e.currentTarget.style.color = 'var(--color-accent-light)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-tertiary)'
        }}
      >
        gerenciar contas
        <span style={{ marginLeft: 'auto' }}>→</span>
      </button>
    </Card>
  )
}

function CardFaturas({ invoices, accounts, onManage }: {
  invoices: FinInvoice[]
  accounts: FinAccount[]
  onManage: () => void
}) {
  const cartoes = accounts.filter(a => a.tipo === 'credito')
  const pendentes = invoices.filter(i => i.status === 'aberta' || i.status === 'fechada')
  const total = pendentes.reduce((s, i) => s + i.total, 0)

  return (
    <div style={cardBase}>
      <div style={cardHeader('var(--color-accent-light)')}>
        <span style={cardLabel}>Todas as faturas</span>
        <span style={cardBigValue}>{formatBRL(total)}</span>
      </div>

      <div style={cardSubLabel}>Meus cartões</div>
      {cartoes.length === 0 ? (
        <EmptyMini text="Adicione seu primeiro cartão" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cartoes.map(c => {
            const cartaoInvoices = pendentes.filter(i => i.cartao_id === c.id)
            const cartaoTotal = cartaoInvoices.reduce((s, i) => s + i.total, 0)
            return (
              <div key={c.id} style={accountRow}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{c.nome}</span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-primary)',
                }}>
                  {formatBRL(cartaoTotal)}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <button onClick={onManage} style={cardLinkButton}>gerenciar cartões →</button>
    </div>
  )
}

function CardContasAPagar({ debts, invoices, accounts }: {
  debts: FinDebt[]
  invoices: FinInvoice[]
  accounts: FinAccount[]
}) {
  // "Contas a pagar" = parcelas próximas de dívidas + faturas vencendo
  const accountById = new Map(accounts.map(a => [a.id, a]))
  const proximasFaturas = invoices
    .filter(i => i.status === 'fechada' || i.status === 'aberta')
    .filter(i => !!i.data_vencimento)
    .sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? ''))
    .slice(0, 4)

  const dividasAtivas = debts
    .filter(d => d.status === 'active')
    .sort((a, b) => (a.parcelas_restantes ?? 0) - (b.parcelas_restantes ?? 0))
    .slice(0, 4)

  const isEmpty = proximasFaturas.length === 0 && dividasAtivas.length === 0

  return (
    <div style={cardBase}>
      <div style={cardLabel}>Contas a pagar</div>
      {isEmpty ? (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
        }}>
          No momento você não possui contas a pagar
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {proximasFaturas.map(inv => {
            const cartao = accountById.get(inv.cartao_id)
            return (
              <div key={inv.id} style={listRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={listRowTitle}>{cartao?.nome ?? '?'} · fatura {inv.mes_referencia}</div>
                  <div style={listRowSub}>vence {inv.data_vencimento}</div>
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-primary)',
                }}>
                  {formatBRL(inv.total)}
                </span>
              </div>
            )
          })}
          {dividasAtivas.map(d => (
            <div key={d.id} style={listRow}>
              <div style={{ minWidth: 0 }}>
                <div style={listRowTitle}>{d.descricao}</div>
                <div style={listRowSub}>
                  {d.parcelas_restantes != null ? `faltam ${d.parcelas_restantes} parcelas` : 'em andamento'}
                </div>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
              }}>
                {formatBRL(d.parcela_mensal ?? d.saldo_devedor)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CardContasAReceber({ parcelas }: { parcelas: FinParcela[] }) {
  const ordenadas = [...parcelas]
    .sort((a, b) => (a.data_prevista ?? 'z').localeCompare(b.data_prevista ?? 'z'))
    .slice(0, 5)
  const total = parcelas.reduce((s, p) => s + p.valor, 0)

  return (
    <div style={cardBase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={cardLabel}>Contas a receber</div>
        {parcelas.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-success)',
          }}>
            {formatBRL(total)}
          </span>
        )}
      </div>
      {parcelas.length === 0 ? (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
        }}>
          Você não possui contas a receber pendentes
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {ordenadas.map(p => (
            <div key={p.id} style={listRow}>
              <div style={{ minWidth: 0 }}>
                <div style={listRowTitle}>{p.projeto_titulo ?? 'projeto'} · parcela #{p.numero}</div>
                <div style={listRowSub}>
                  {p.data_prevista ? `prevista ${p.data_prevista}` : 'sem data'}
                </div>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-success)',
              }}>
                {formatBRL(p.valor)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CardMaioresGastos({ transactions, categories }: {
  transactions: FinTransaction[]
  categories: ReturnType<typeof useHubFinance>['categories']
}) {
  const catById = new Map(categories.map(c => [c.id, c]))
  // Agrega gastos por categoria, ordena desc, top 5
  const aggregates = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.valor >= 0) continue
      const cat = tx.categoria_id ?? '__none__'
      map.set(cat, (map.get(cat) ?? 0) + Math.abs(tx.valor))
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [transactions])

  return (
    <div style={cardBase}>
      <div style={cardLabel}>Maiores gastos do mês</div>
      {aggregates.length === 0 ? (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
        }}>
          Sem gastos no período
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {aggregates.map(([catId, valor]) => {
            const cat = catId === '__none__' ? null : catById.get(catId)
            return (
              <div key={catId} style={listRow}>
                <span style={{
                  fontSize: 12, color: 'var(--color-text-secondary)',
                }}>
                  {cat?.nome ?? '(sem categoria)'}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent-primary)',
                }}>
                  {formatBRL(valor)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CardDividas({ debts, onManage }: {
  debts: FinDebt[]
  onManage: () => void
}) {
  const ativas = debts.filter(d => d.status === 'active')
  const totalDevedor = ativas.reduce((s, d) => s + d.saldo_devedor, 0)
  const totalOriginal = ativas.reduce((s, d) => s + d.valor_total_original, 0)
  const totalPago = ativas.reduce((s, d) => s + d.valor_pago, 0)
  const progressoGlobal = totalOriginal > 0 ? Math.min(100, (totalPago / totalOriginal) * 100) : 0

  // Ordena por menor parcelas restantes (= próximas a quitar) — incentivo positivo
  const top = [...ativas]
    .sort((a, b) => (a.parcelas_restantes ?? 999) - (b.parcelas_restantes ?? 999))
    .slice(0, 3)

  return (
    <div style={cardBase}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14,
      }}>
        <Landmark size={12} strokeWidth={1.8} style={{ color: 'var(--color-text-tertiary)' }} />
        <span style={cardLabel}>Dívidas</span>
        {ativas.length > 0 && (
          <span style={{
            fontSize: 11, color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {ativas.length} ativa{ativas.length === 1 ? '' : 's'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onManage} style={{
          background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
          color: 'var(--color-text-tertiary)',
          fontSize: 9, padding: '5px 10px', borderRadius: 3,
          fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          gerenciar →
        </button>
      </div>

      {ativas.length === 0 ? (
        <div style={{
          padding: '20px 16px',
          border: '1px dashed var(--color-border)', borderRadius: 4,
          textAlign: 'center', color: 'var(--color-text-muted)',
          fontSize: 11, fontStyle: 'italic',
        }}>
          nenhuma dívida ativa. cadastre faculdade, financiamento ou parcelamento
          via "gerenciar".
        </div>
      ) : (
        <>
          {/* Hero: total devedor + barra de progresso global */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            marginBottom: 14,
          }}>
            <div>
              <div style={{
                fontSize: 9, color: 'var(--color-text-muted)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
              }}>
                Total devedor
              </div>
              <div style={{
                fontSize: 22, fontWeight: 700,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
              }}>
                {formatBRL(totalDevedor)}
              </div>
              <div style={{
                fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2,
              }}>
                de {formatBRL(totalOriginal)} ({progressoGlobal.toFixed(0)}% pago)
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{
                height: 6, background: 'var(--color-border)',
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${progressoGlobal}%`,
                  background: progressoGlobal >= 75
                    ? 'var(--color-success)'
                    : progressoGlobal >= 30
                      ? 'var(--color-accent-light)'
                      : 'var(--color-accent-primary)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          </div>

          {/* Lista enxuta: top 3 dívidas mais próximas de quitar */}
          <div style={{
            fontSize: 9, color: 'var(--color-text-muted)',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
          }}>
            Próximas a quitar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top.map(d => (
              <div key={d.id} style={listRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={listRowTitle}>{d.descricao}</div>
                  <div style={listRowSub}>
                    {d.parcelas_restantes != null
                      ? `${d.parcelas_restantes} parcela${d.parcelas_restantes === 1 ? '' : 's'} restante${d.parcelas_restantes === 1 ? '' : 's'} · ${d.progresso_pct.toFixed(0)}% pago`
                      : `${d.progresso_pct.toFixed(0)}% pago`}
                  </div>
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-primary)',
                }}>
                  {formatBRL(d.saldo_devedor)}
                </span>
              </div>
            ))}
            {ativas.length > 3 && (
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 4 }}>
                + {ativas.length - 3} dívida{ativas.length - 3 === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CardOrcamento({ budget }: { budget: ReturnType<typeof useHubFinance>['budget'] }) {
  const items = budget?.items ?? []
  // Ordenação: estourados primeiro (% desc), depois por % consumido desc.
  const sorted = [...items].sort((a, b) => b.percent - a.percent)
  const top = sorted.slice(0, 4)

  return (
    <div style={cardBase}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={cardLabel}>Orçamento do mês</div>
        {items.length > 0 && (
          <span style={{
            fontSize: 9, color: 'var(--color-text-muted)',
            letterSpacing: '0.05em',
          }}>
            {items.length} categoria{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div style={{
          padding: '20px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          nenhum limite definido ainda.
          <br />
          <span style={{ fontSize: 10, opacity: 0.7 }}>
            defina em "categorias" pra ver consumo aqui.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {top.map(item => <BudgetRow key={item.categoria_id} item={item} />)}
          {sorted.length > top.length && (
            <div style={{
              fontSize: 9, color: 'var(--color-text-muted)',
              fontStyle: 'italic', textAlign: 'center', marginTop: 2,
            }}>
              + {sorted.length - top.length} outra{sorted.length - top.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BudgetRow({ item }: { item: NonNullable<ReturnType<typeof useHubFinance>['budget']>['items'][number] }) {
  const isReceita = item.tipo === 'receita'
  const pct = Math.min(item.percent, 100)
  const overflowPct = Math.max(item.percent - 100, 0)
  // Despesa: verde até 70%, amarelo 70-100%, vermelho >100% (estourou).
  // Receita: lógica invertida — verde quando >=100% (bateu meta), vermelho longe.
  let barColor: string
  if (isReceita) {
    barColor = item.percent >= 100
      ? 'var(--color-success)'
      : item.percent >= 50
        ? 'var(--color-accent-light)'
        : 'var(--color-text-tertiary)'
  } else {
    barColor = item.percent > 100
      ? 'var(--color-accent-primary)'
      : item.percent >= 70
        ? '#f59e0b'
        : 'var(--color-success)'
  }
  const swatch = item.cor || 'var(--color-accent-light)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: swatch, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11, color: 'var(--color-text-primary)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.nome}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {formatBRL(item.consumido)}
          <span style={{ color: 'var(--color-text-tertiary)' }}> / {formatBRL(item.limite_mensal)}</span>
        </span>
      </div>
      <div style={{
        position: 'relative',
        height: 4, background: 'var(--color-bg-primary)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: barColor,
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: 'var(--color-text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>
          {item.percent.toFixed(0)}%{isReceita ? ' da meta' : ' usado'}
        </span>
        <span style={{
          color: overflowPct > 0
            ? 'var(--color-accent-primary)'
            : isReceita && item.percent >= 100
              ? 'var(--color-success)'
              : 'var(--color-text-muted)',
        }}>
          {overflowPct > 0
            ? `+${formatBRL(item.consumido - item.limite_mensal)} excedido`
            : `${formatBRL(item.restante)} ${isReceita ? 'p/ meta' : 'restante'}`}
        </span>
      </div>
    </div>
  )
}

function NoAccountsState() {
  return (
    <EmptyState
      text="Você ainda não tem contas cadastradas"
      sub="Use o botão '+ nova conta' no topo pra começar."
    />
  )
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div style={{
      padding: '16px 0', textAlign: 'center',
      fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
    }}>
      {text}
    </div>
  )
}

// ─── Estilos compartilhados ──────────────────────────────────────────────

const cardBase: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  padding: '16px 18px',
}

function cardHeader(accentColor: string): React.CSSProperties {
  return {
    paddingBottom: 14,
    marginBottom: 14,
    borderBottom: '1px solid var(--color-border)',
    borderLeft: `3px solid ${accentColor}`,
    paddingLeft: 12,
    marginLeft: -12,
    marginRight: -12,
    paddingRight: 12,
  }
}

const cardLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-text-tertiary)',
  letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600,
  display: 'block', marginBottom: 2,
}

const cardBigValue: React.CSSProperties = {
  fontSize: 22, fontWeight: 700,
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)',
  display: 'block',
}

const cardSubLabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-text-tertiary)',
  letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
  marginBottom: 8, marginTop: 4,
}

const cardLinkButton: React.CSSProperties = {
  display: 'block', width: '100%',
  marginTop: 12, paddingTop: 10,
  borderTop: '1px solid var(--color-border)',
  border: 'none', borderTopStyle: 'solid',
  background: 'none', cursor: 'pointer',
  fontSize: 10, color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  textAlign: 'center', fontFamily: 'inherit',
  paddingBottom: 0,
  transition: 'color 0.15s',
}

const accountRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '6px 0',
}

const listRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: 12, padding: '6px 0',
}

const listRowTitle: React.CSSProperties = {
  fontSize: 12, color: 'var(--color-text-primary)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const listRowSub: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2,
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-tertiary)', padding: 2,
  display: 'inline-flex', alignItems: 'center',
}

// ─── Helpers de mês ──────────────────────────────────────────────────────

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_PT[month - 1]} ${year}`
}

function shiftMonth(current: { year: number; month: number }, delta: number) {
  const d = new Date(current.year, current.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

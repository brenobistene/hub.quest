/**
 * Hub Finance — context compartilhado entre as sub-páginas (Visão Geral,
 * Lançamentos, Cartões, Dívidas, Freelas, Categorias).
 *
 * Centraliza state + fetches pra evitar N requests por página e duplicação
 * de lógica. Cada sub-página chama `useHubFinance()` e usa só o que precisa.
 *
 * Doc autoritativa do módulo: docs/hub-finance/PLAN.md
 */
import { createContext, useContext, useEffect, useState } from 'react'
import {
  fetchFinAccounts, fetchFinCategories, fetchFinTransactions, fetchFinSummary,
  fetchFinMonthlySummary, fetchFinHourlyRateStats,
  fetchFinDebts, fetchFinClients, fetchFinInvoices,
  fetchFinFreelaProjects, fetchFinBudget,
  reportApiError,
} from '../../api'
import type {
  FinAccount, FinCategory, FinTransaction, FinSummary, FinMonthlySummary,
  FinDebt, FinClient, FinHourlyRateStats, FinInvoice, FinFreelaProject,
  FinBudget,
} from '../../types'

interface HubFinanceContextValue {
  // Dados globais (não dependem do mês)
  accounts: FinAccount[]
  categories: FinCategory[]
  summary: FinSummary | null
  debts: FinDebt[]
  clients: FinClient[]
  hourlyStats: FinHourlyRateStats | null
  invoices: FinInvoice[]
  freelaProjects: FinFreelaProject[]

  // Dados do mês selecionado
  transactions: FinTransaction[]
  monthlySummary: FinMonthlySummary | null
  budget: FinBudget | null
  selectedMonth: { year: number; month: number }
  setSelectedMonth: (m: { year: number; month: number }) => void

  loading: boolean
  /** Refetch tudo. Use quando ação afeta múltiplos blocos (ex: pagar fatura,
   *  importar CSV). Pra ações isoladas, prefira o refresh específico. */
  refreshAll: () => void
  /** Refetch só dados globais (não recarrega transações do mês). */
  refreshGlobal: () => void
  /** Refetch só dados do mês atualmente selecionado. */
  refreshForMonth: () => void
}

const HubFinanceContext = createContext<HubFinanceContextValue | null>(null)

export function useHubFinance(): HubFinanceContextValue {
  const ctx = useContext(HubFinanceContext)
  if (!ctx) throw new Error('useHubFinance: precisa estar dentro de <HubFinanceProvider>')
  return ctx
}

export function HubFinanceProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [transactions, setTransactions] = useState<FinTransaction[]>([])
  const [summary, setSummary] = useState<FinSummary | null>(null)
  const [monthlySummary, setMonthlySummary] = useState<FinMonthlySummary | null>(null)
  const [budget, setBudget] = useState<FinBudget | null>(null)
  const [debts, setDebts] = useState<FinDebt[]>([])
  const [clients, setClients] = useState<FinClient[]>([])
  const [hourlyStats, setHourlyStats] = useState<FinHourlyRateStats | null>(null)
  const [invoices, setInvoices] = useState<FinInvoice[]>([])
  const [freelaProjects, setFreelaProjects] = useState<FinFreelaProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  function refreshGlobal() {
    Promise.all([
      fetchFinAccounts(),
      fetchFinCategories(),
      fetchFinSummary(),
      fetchFinDebts(),
      fetchFinClients(),
      fetchFinHourlyRateStats(),
      fetchFinInvoices(),
      fetchFinFreelaProjects(),
    ])
      .then(([a, c, s, d, cl, hs, inv, fp]) => {
        setAccounts(a); setCategories(c); setSummary(s); setDebts(d)
        setClients(cl); setHourlyStats(hs); setInvoices(inv); setFreelaProjects(fp)
      })
      .catch(err => reportApiError('HubFinance.refreshGlobal', err))
      .finally(() => setLoading(false))
  }

  function refreshForMonth() {
    const { year, month } = selectedMonth
    const lastDay = new Date(year, month, 0).getDate()
    const dataDe = `${year}-${String(month).padStart(2, '0')}-01`
    const dataAte = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    Promise.all([
      fetchFinMonthlySummary(year, month),
      fetchFinTransactions({ data_de: dataDe, data_ate: dataAte, limit: 500 }),
      fetchFinBudget(year, month),
    ])
      .then(([ms, txs, b]) => { setMonthlySummary(ms); setTransactions(txs); setBudget(b) })
      .catch(err => reportApiError('HubFinance.refreshForMonth', err))
  }

  function refreshAll() { refreshGlobal(); refreshForMonth() }

  useEffect(() => { refreshGlobal() }, [])
  useEffect(() => { refreshForMonth() },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedMonth.year, selectedMonth.month])

  const value: HubFinanceContextValue = {
    accounts, categories, transactions, summary, monthlySummary, budget,
    debts, clients, hourlyStats, invoices, freelaProjects,
    selectedMonth, setSelectedMonth,
    loading,
    refreshAll, refreshGlobal, refreshForMonth,
  }

  return <HubFinanceContext.Provider value={value}>{children}</HubFinanceContext.Provider>
}

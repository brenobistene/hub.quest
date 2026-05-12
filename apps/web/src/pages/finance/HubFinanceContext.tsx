/**
 * Hub Finance — context compartilhado entre as sub-páginas (Visão Geral,
 * Lançamentos, Cartões, Dívidas, Freelas, Categorias).
 *
 * Implementação usa React Query internamente via os hooks de
 * `lib/finance-queries.ts`. O context permanece como wrapper pra duas
 * razões:
 *  1. Compatibilidade: ~10 páginas consumiam `useHubFinance()` com uma
 *     API específica (accounts, transactions, refreshAll, etc). Mantida
 *     intacta — zero alteração nos consumers.
 *  2. selectedMonth: estado compartilhado entre páginas (você seleciona
 *     o mês na VisãoGeral e a aba Lançamentos reflete). Continua no
 *     context (não é cache de servidor).
 *
 * Doc autoritativa do módulo: docs/hub-finance/PLAN.md
 */
import { createContext, useContext, useEffect, useState } from 'react'
import {
  useFinAccounts, useFinCategories, useFinSummary, useFinDebts,
  useFinClients, useFinHourlyStats, useFinInvoices, useFinFreelaProjects,
  useFinRecurringBills,
  useFinMonthlySummary, useFinTransactions, useFinRecurringBillsStatus,
  useFinMonthCommitments,
  useFinanceInvalidator,
} from '../../lib/finance-queries'
import { tabSync } from '../../lib/tabsync'
import type {
  FinAccount, FinCategory, FinTransaction, FinSummary, FinMonthlySummary,
  FinDebt, FinClient, FinHourlyRateStats, FinInvoice, FinFreelaProject,
  FinRecurringBill, FinRecurringBillStatusMonth,
  FinMonthCommitments,
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
  recurringBills: FinRecurringBill[]

  // Dados do mês selecionado
  transactions: FinTransaction[]
  monthlySummary: FinMonthlySummary | null
  recurringBillsStatus: FinRecurringBillStatusMonth | null
  monthCommitments: FinMonthCommitments | null
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

  /** Modo privacidade: quando true, valores monetários (qualquer span com
   *  className `hq-money`) ficam borrados via CSS. Persistido em localStorage
   *  pra sobreviver reload. Toggle vive na tab bar do HubFinanceLayout. */
  privateMode: boolean
  togglePrivate: () => void
}

const HubFinanceContext = createContext<HubFinanceContextValue | null>(null)

export function useHubFinance(): HubFinanceContextValue {
  const ctx = useContext(HubFinanceContext)
  if (!ctx) throw new Error('useHubFinance: precisa estar dentro de <HubFinanceProvider>')
  return ctx
}

export function HubFinanceProvider({ children }: { children: React.ReactNode }) {
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  // Private mode: ON por padrão (usuário pediu pra Hub Finance abrir sempre
  // com os valores escondidos). Persiste em localStorage — se usuário
  // desligar manualmente, fica desligado até religar.
  const [privateMode, setPrivateMode] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('hq-finance-private')
      return v === null ? true : v === '1'
    } catch { return true }
  })
  function togglePrivate() {
    setPrivateMode(prev => {
      const next = !prev
      try { localStorage.setItem('hq-finance-private', next ? '1' : '0') } catch {}
      return next
    })
  }

  // Queries globais
  const qAccounts = useFinAccounts()
  const qCategories = useFinCategories()
  const qSummary = useFinSummary()
  const qDebts = useFinDebts()
  const qClients = useFinClients()
  const qHourlyStats = useFinHourlyStats()
  const qInvoices = useFinInvoices()
  const qFreelaProjects = useFinFreelaProjects()
  const qRecurringBills = useFinRecurringBills()

  // Queries do mês — refetcham automaticamente quando selectedMonth muda
  // porque ano/mês fazem parte da query key.
  const qMonthlySummary = useFinMonthlySummary(selectedMonth.year, selectedMonth.month)
  const qTransactions = useFinTransactions(selectedMonth.year, selectedMonth.month)
  const qRecurringBillsStatus = useFinRecurringBillsStatus(selectedMonth.year, selectedMonth.month)
  const qMonthCommitments = useFinMonthCommitments(selectedMonth.year, selectedMonth.month)

  const invalidator = useFinanceInvalidator()

  // Sync entre abas: quando uma aba muta finance, outras invalidam cache.
  useEffect(() => {
    return tabSync.on('finance', () => { invalidator.all() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Loading global: true até as queries-base resolverem na primeira vez.
  const loading = qAccounts.isPending || qCategories.isPending || qSummary.isPending

  const value: HubFinanceContextValue = {
    accounts: qAccounts.data ?? [],
    categories: qCategories.data ?? [],
    summary: qSummary.data ?? null,
    debts: qDebts.data ?? [],
    clients: qClients.data ?? [],
    hourlyStats: qHourlyStats.data ?? null,
    invoices: qInvoices.data ?? [],
    freelaProjects: qFreelaProjects.data ?? [],
    recurringBills: qRecurringBills.data ?? [],
    transactions: qTransactions.data ?? [],
    monthlySummary: qMonthlySummary.data ?? null,
    recurringBillsStatus: qRecurringBillsStatus.data ?? null,
    monthCommitments: qMonthCommitments.data ?? null,
    selectedMonth,
    setSelectedMonth,
    loading,
    refreshAll: () => { invalidator.all(); tabSync.emit('finance') },
    refreshGlobal: () => { invalidator.global(); tabSync.emit('finance') },
    refreshForMonth: () => {
      invalidator.forMonth(selectedMonth.year, selectedMonth.month)
      tabSync.emit('finance')
    },
    privateMode,
    togglePrivate,
  }

  return <HubFinanceContext.Provider value={value}>{children}</HubFinanceContext.Provider>
}

/**
 * React Query hooks pro módulo Hub Health.
 *
 * Padrão segue lib/build-queries.ts:
 *  - Query keys agrupados em `healthKeys` pra invalidação granular
 *  - Cada query/mutation com hook próprio
 *  - Mutations invalidam só o que muda (records de um domínio invalidam a
 *    lista daquele domínio, não tudo)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveHealthItem,
  createHealthDomain,
  createHealthItem,
  createHealthRecord,
  deleteHealthDomain,
  deleteHealthItem,
  deleteHealthRecord,
  fetchHealthDomain,
  fetchHealthDomains,
  fetchHealthItems,
  fetchHealthMetricsCatalog,
  fetchHealthMetricValue,
  fetchHealthPending,
  fetchHealthRecords,
  fetchHealthSettings,
  migrateRefeicao2modos,
  fetchMindTags, createMindTag, updateMindTag, deleteMindTag,
  fetchMindSessions, createMindSession, updateMindSession, deleteMindSession,
  fetchMindHipoteses, updateMindHipotese, fetchMindChallenges, fetchMindPadroes,
  unarchiveHealthItem,
  updateHealthDomain,
  updateHealthItem,
  updateHealthRecord,
  updateHealthSettings,
  type HealthRecordsQuery,
} from '../api'
import type {
  HealthDomainCreate,
  HealthDomainUpdate,
  HealthItemCreate,
  HealthItemUpdate,
  HealthRecordCreate,
  HealthRecordUpdate,
  HealthSettingsUpdate,
  MindTagUpdate,
  MindSessionUpdate,
} from '../types'

export const healthKeys = {
  all: ['health'] as const,
  domains: (includeInactive = false) =>
    [...healthKeys.all, 'domains', { includeInactive }] as const,
  domain: (slug: string) => [...healthKeys.all, 'domain', slug] as const,
  items: (domainSlug: string, includeArchived = false) =>
    [...healthKeys.all, 'items', domainSlug, { includeArchived }] as const,
  records: (domainSlug: string, query?: HealthRecordsQuery) =>
    [...healthKeys.all, 'records', domainSlug, query ?? {}] as const,
  settings: () => [...healthKeys.all, 'settings'] as const,
  metricsCatalog: () => [...healthKeys.all, 'metrics-catalog'] as const,
  metricValue: (slug: string, itemId?: number) =>
    [...healthKeys.all, 'metric-value', slug, itemId ?? null] as const,
  pending: () => [...healthKeys.all, 'pending'] as const,
  // Mind
  mindTags: (includeArchived = false) =>
    [...healthKeys.all, 'mind', 'tags', { includeArchived }] as const,
  mindSessions: (params?: { from?: string; to?: string; tag_slug?: string; limit?: number }) =>
    [...healthKeys.all, 'mind', 'sessions', params ?? {}] as const,
  mindHipoteses: (status?: string) =>
    [...healthKeys.all, 'mind', 'hipoteses', status ?? 'all'] as const,
  mindChallenges: () => [...healthKeys.all, 'mind', 'challenges'] as const,
  mindPadroes: (dias: number) => [...healthKeys.all, 'mind', 'padroes', dias] as const,
}

// ─── Domínios ─────────────────────────────────────────────────────────────

export function useHealthDomains(includeInactive = false) {
  return useQuery({
    queryKey: healthKeys.domains(includeInactive),
    queryFn: () => fetchHealthDomains(includeInactive),
  })
}

export function useHealthDomain(slug: string) {
  return useQuery({
    queryKey: healthKeys.domain(slug),
    queryFn: () => fetchHealthDomain(slug),
    enabled: !!slug,
  })
}

export function useCreateHealthDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: HealthDomainCreate) => createHealthDomain(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'domains'] })
    },
  })
}

export function useUpdateHealthDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, patch }: { slug: string; patch: HealthDomainUpdate }) =>
      updateHealthDomain(slug, patch),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'domains'] })
      qc.invalidateQueries({ queryKey: healthKeys.domain(vars.slug) })
    },
  })
}

export function useDeleteHealthDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => deleteHealthDomain(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'domains'] })
    },
  })
}

// ─── Itens ────────────────────────────────────────────────────────────────

export function useHealthItems(domainSlug: string, includeArchived = false) {
  return useQuery({
    queryKey: healthKeys.items(domainSlug, includeArchived),
    queryFn: () => fetchHealthItems(domainSlug, includeArchived),
    enabled: !!domainSlug,
  })
}

export function useCreateHealthItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      domainSlug,
      body,
    }: {
      domainSlug: string
      body: HealthItemCreate
    }) => createHealthItem(domainSlug, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: [...healthKeys.all, 'items', vars.domainSlug],
      })
    },
  })
}

export function useUpdateHealthItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: HealthItemUpdate }) =>
      updateHealthItem(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'items'] })
    },
  })
}

export function useArchiveHealthItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => archiveHealthItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'items'] })
    },
  })
}

export function useUnarchiveHealthItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unarchiveHealthItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'items'] })
    },
  })
}

export function useDeleteHealthItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteHealthItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'items'] })
    },
  })
}

// ─── Registros ────────────────────────────────────────────────────────────

export function useHealthRecords(
  domainSlug: string,
  query?: HealthRecordsQuery,
) {
  return useQuery({
    queryKey: healthKeys.records(domainSlug, query),
    queryFn: () => fetchHealthRecords(domainSlug, query),
    enabled: !!domainSlug,
  })
}

/**
 * Invalida tudo que depende de records: a própria lista, métricas
 * (cidadãs derivadas) e pendências. Sem esse fanout o auto-save do cigarro
 * deixava `tempo_desde_ultimo_consumo` (Dashboard) e o MetricsPanel
 * mostrando dado stale até refresh manual.
 */
function invalidateRecordsFanout(qc: ReturnType<typeof useQueryClient>, domainSlug?: string) {
  if (domainSlug) {
    qc.invalidateQueries({
      queryKey: [...healthKeys.all, 'records', domainSlug],
    })
  } else {
    qc.invalidateQueries({ queryKey: [...healthKeys.all, 'records'] })
  }
  qc.invalidateQueries({ queryKey: [...healthKeys.all, 'metric-value'] })
  qc.invalidateQueries({ queryKey: healthKeys.pending() })
}

export function useCreateHealthRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      domainSlug,
      body,
    }: {
      domainSlug: string
      body: HealthRecordCreate
    }) => createHealthRecord(domainSlug, body),
    onSuccess: (_, vars) => {
      invalidateRecordsFanout(qc, vars.domainSlug)
    },
  })
}

export function useUpdateHealthRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: HealthRecordUpdate }) =>
      updateHealthRecord(id, patch),
    onSuccess: () => {
      invalidateRecordsFanout(qc)
    },
  })
}

export function useDeleteHealthRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteHealthRecord(id),
    onSuccess: () => {
      invalidateRecordsFanout(qc)
    },
  })
}

// ─── Settings ─────────────────────────────────────────────────────────────

export function useHealthSettings() {
  return useQuery({
    queryKey: healthKeys.settings(),
    queryFn: fetchHealthSettings,
  })
}

export function useUpdateHealthSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: HealthSettingsUpdate) => updateHealthSettings(patch),
    onSuccess: (data) => {
      qc.setQueryData(healthKeys.settings(), data)
    },
  })
}

// ─── Métricas ─────────────────────────────────────────────────────────────

export function useHealthMetricsCatalog() {
  return useQuery({
    queryKey: healthKeys.metricsCatalog(),
    queryFn: fetchHealthMetricsCatalog,
    staleTime: 30 * 60 * 1000,        // catálogo muda raramente — TTL 30min
  })
}

/** Calcula valor de uma métrica. Pra Vícios e Medidas precisa de itemId. */
export function useHealthMetricValue(slug: string, itemId?: number, enabled = true) {
  return useQuery({
    queryKey: healthKeys.metricValue(slug, itemId),
    queryFn: () => fetchHealthMetricValue(slug, itemId),
    enabled: enabled && !!slug,
  })
}

// ─── Pendências (lembretes + ausência) ────────────────────────────────────

/**
 * Lembretes proativos + ausências retroativas. Refetch a cada 60s pra
 * detectar mudanças temporais (passou da hora de uma refeição, etc.) sem
 * recarregar manualmente.
 */
export function useHealthPending() {
  return useQuery({
    queryKey: healthKeys.pending(),
    queryFn: fetchHealthPending,
    staleTime: 30 * 1000,             // 30s — pendências mudam com a hora
    refetchInterval: 60 * 1000,       // refetch passivo a cada minuto
  })
}

// ─── Admin: migração refeicao_2modos legacy → agrupado ───────────────────

export function useMigrateRefeicao2modos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: migrateRefeicao2modos,
    onSuccess: () => {
      // Fan-out: records + métricas + pending precisam refetch.
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'records'] })
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'metric-value'] })
      qc.invalidateQueries({ queryKey: healthKeys.pending() })
    },
  })
}

// ─── Mind ─────────────────────────────────────────────────────────────────

function invalidateMindFanout(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [...healthKeys.all, 'mind'] })
  qc.invalidateQueries({ queryKey: [...healthKeys.all, 'records', 'mind'] })
  qc.invalidateQueries({ queryKey: [...healthKeys.all, 'metric-value'] })
  qc.invalidateQueries({ queryKey: healthKeys.pending() })
}

export function useMindTags(includeArchived = false) {
  return useQuery({
    queryKey: healthKeys.mindTags(includeArchived),
    queryFn: () => fetchMindTags(includeArchived),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateMindTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createMindTag,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'mind', 'tags'] }),
  })
}

export function useUpdateMindTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MindTagUpdate }) =>
      updateMindTag(id, patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...healthKeys.all, 'mind', 'tags'] }),
  })
}

export function useDeleteMindTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteMindTag(id),
    onSuccess: () => invalidateMindFanout(qc),
  })
}

export function useMindSessions(params?: {
  from?: string
  to?: string
  tag_slug?: string
  limit?: number
}) {
  return useQuery({
    queryKey: healthKeys.mindSessions(params),
    queryFn: () => fetchMindSessions(params),
  })
}

export function useCreateMindSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createMindSession,
    onSuccess: () => invalidateMindFanout(qc),
  })
}

export function useUpdateMindSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MindSessionUpdate }) =>
      updateMindSession(id, patch),
    onSuccess: () => invalidateMindFanout(qc),
  })
}

export function useDeleteMindSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteMindSession(id),
    onSuccess: () => invalidateMindFanout(qc),
  })
}

export function useMindHipoteses(status?: 'pending' | 'validated' | 'refuted' | 'suspended') {
  return useQuery({
    queryKey: healthKeys.mindHipoteses(status),
    queryFn: () => fetchMindHipoteses(status),
  })
}

export function useUpdateMindHipotese() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'pending' | 'validated' | 'refuted' | 'suspended' }) =>
      updateMindHipotese(id, status),
    onSuccess: () => invalidateMindFanout(qc),
  })
}

export function useMindChallenges() {
  return useQuery({
    queryKey: healthKeys.mindChallenges(),
    queryFn: fetchMindChallenges,
  })
}

export function useMindPadroes(dias = 30) {
  return useQuery({
    queryKey: healthKeys.mindPadroes(dias),
    queryFn: () => fetchMindPadroes(dias),
  })
}

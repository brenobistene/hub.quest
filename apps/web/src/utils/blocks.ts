/**
 * Unproductive blocks shown on the Calendário. A block has hour-decimal
 * start/end (e.g. 21.5 for 21:30). If `end <= start`, it crosses midnight
 * (e.g. Sono 21:30 → 05:30) and renders as two segments on the visible day:
 * the "head" from `start` to 24 today, plus the "tail" from 0 to `end`
 * inherited from yesterday.
 */

export interface BlockOverride {
  /** YYYY-MM-DD da ocorrência afetada. */
  date: string
  /** start/end customizados (decimal de hora, ex: 21.5 = 21:30). Omitido = herda do bloco. */
  start?: number
  end?: number
  /** Pula esse dia totalmente. */
  skipped?: boolean
}

export interface UnproductiveBlock {
  id: string
  title: string
  start: number
  end: number
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom'
  daysOfWeek?: number[] // 0-6, 0=Sunday
  endsOn: 'never' | 'date' | 'count'
  endDate?: string
  endCount?: number
  /** YYYY-MM-DD — primeira data em que esse bloco passa a valer. Usado pelo
   *  split "este e seguintes": o bloco original fica com `effectiveUntil`
   *  no dia anterior, e um novo bloco nasce com `effectiveFrom` no dia escolhido. */
  effectiveFrom?: string
  /** YYYY-MM-DD — última data coberta pelo bloco. */
  effectiveUntil?: string
  /** Overrides de dia único ("apenas este evento"). Upsertado por `date`. */
  overrides?: BlockOverride[]
}

export interface BlockRange {
  block: UnproductiveBlock
  start: number
  end: number
}

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function blockOccursOnDate(block: UnproductiveBlock, date: Date): boolean {
  // Janela de validade (split "este e seguintes").
  const iso = ymd(date)
  if (block.effectiveFrom && iso < block.effectiveFrom) return false
  if (block.effectiveUntil && iso > block.effectiveUntil) return false

  // 'none' = evento único — quem filtra é a janela de validade acima
  // (effectiveFrom == effectiveUntil == a única data desse evento).
  if (block.recurrence === 'none') return true

  const dow = date.getDay()
  if (block.recurrence === 'daily') return true
  if (block.recurrence === 'weekdays') return dow >= 1 && dow <= 5
  if (block.recurrence === 'weekly' || block.recurrence === 'custom')
    return !!block.daysOfWeek?.includes(dow)
  return false
}

/** Aplica override daquela data, se houver. Retorna null se `skipped=true`. */
function applyOverride(block: UnproductiveBlock, date: Date): UnproductiveBlock | null {
  const iso = ymd(date)
  const ov = block.overrides?.find(o => o.date === iso)
  if (!ov) return block
  if (ov.skipped) return null
  return {
    ...block,
    start: ov.start ?? block.start,
    end: ov.end ?? block.end,
  }
}

export function getBlockRangesForDay(block: UnproductiveBlock, date: Date): BlockRange[] {
  const ranges: BlockRange[] = []

  // Cabeça (hoje): pode ter override próprio.
  if (blockOccursOnDate(block, date)) {
    const today = applyOverride(block, date)
    if (today) {
      const crosses = today.end <= today.start
      if (crosses) ranges.push({ block: today, start: today.start, end: 24 })
      else ranges.push({ block: today, start: today.start, end: today.end })
    }
  }

  // Cauda (herdada de ontem): usa os valores que ontem tinha (com override de ontem, se houver).
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  if (blockOccursOnDate(block, yesterday)) {
    const prev = applyOverride(block, yesterday)
    if (prev) {
      const prevCrosses = prev.end <= prev.start
      if (prevCrosses && prev.end > 0) {
        ranges.push({ block: prev, start: 0, end: prev.end })
      }
    }
  }

  return ranges
}

export function getAllBlockRangesForDay(blocks: UnproductiveBlock[], date: Date): BlockRange[] {
  const out: BlockRange[] = []
  for (const b of blocks) out.push(...getBlockRangesForDay(b, date))
  return out
}

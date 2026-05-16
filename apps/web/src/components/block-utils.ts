/**
 * Helpers leves do BlockNote — sem dependência da lib pesada.
 *
 * Separados do `BlockEditor.tsx` (que importa ~1.1 MB de @blocknote)
 * pra permitir que consumers usem `isBlockDocEmpty` no save flow sem
 * forçar o chunk pesado a baixar. O componente `<BlockEditor>` em si
 * é lazy-loaded onde for renderizado.
 */

/**
 * Detecta se o JSON serializado do BlockNote representa documento vazio
 * (zero blocos, ou único bloco paragraph sem texto). Usado pra gravar
 * `null` no DB em vez de poluir com JSON vazio.
 *
 * Aceita também texto legado (não-JSON): vazio se só-whitespace.
 */
export function isBlockDocEmpty(serialized: string | null | undefined): boolean {
  if (!serialized) return true
  const s = serialized.trim()
  if (!s) return true
  try {
    const doc = JSON.parse(s)
    if (!Array.isArray(doc)) return !s
    if (doc.length === 0) return true
    if (doc.length === 1) {
      const b = doc[0]
      if (b?.type === 'paragraph') {
        const content = b.content
        if (!content) return true
        if (Array.isArray(content) && content.length === 0) return true
        if (Array.isArray(content) && content.every((c: any) => !c?.text?.trim())) return true
      }
    }
    return false
  } catch {
    // Não é JSON — texto legado. Vazio se só-whitespace.
    return !s
  }
}

/**
 * Extrai texto plano dos primeiros blocos do JSON do BlockNote, truncado
 * em `maxChars` chars. Usado pra hover preview do card de page (Notion-style:
 * passa o mouse no card, vê primeiros parágrafos).
 *
 * Ignora tipos sem conteúdo textual (page, divider). Pra blocos com
 * conteúdo inline (paragraph/heading/bulletListItem/etc), concatena texto
 * com `\n` entre blocks. Retorna `null` quando não há texto extraível
 * (página vazia ou só estruturas sem texto).
 */
export function extractPlainTextPreview(
  serialized: string | null | undefined,
  maxChars = 240,
): string | null {
  if (!serialized) return null
  let doc: any
  try {
    doc = JSON.parse(serialized)
  } catch {
    // Texto legado — retorna direto, truncado.
    const s = String(serialized).trim()
    return s ? truncate(s, maxChars) : null
  }
  if (!Array.isArray(doc)) return null

  const lines: string[] = []
  for (const block of doc) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'page' || block.type === 'divider') continue
    const text = inlineContentToText(block.content)
    if (text) lines.push(text)
    if (lines.join('\n').length >= maxChars) break
  }
  if (lines.length === 0) return null
  return truncate(lines.join('\n'), maxChars)
}

function inlineContentToText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((c: any) => (c && typeof c === 'object' && typeof c.text === 'string') ? c.text : '')
    .join('')
    .trim()
}

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return s.slice(0, maxChars - 1).trimEnd() + '…'
}

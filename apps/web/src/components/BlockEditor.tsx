import { useEffect, useMemo } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core'
import type { Block, PartialBlock } from '@blocknote/core'
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

/**
 * Editor estilo Notion — blocos tipados (paragraph, heading 1-3, bullet,
 * numbered, checklist, divider) com menu slash, drag handle e botão "+"
 * no hover. Wrapper em volta do BlockNote pra encaixar no modelo de dados
 * do Hub Quest, que hoje armazena `notes`/`description` como TEXT simples.
 *
 * Compatibilidade com legado: se o valor salvo for texto puro (não JSON),
 * é convertido pra um único bloco paragraph na carga. Na gravação sempre
 * salva como JSON serializado.
 *
 * Restringe o schema padrão do BlockNote pra só os tipos que o usuário
 * pediu — remove tabela, código, imagem, vídeo, áudio, arquivo etc.
 */

// Schema reduzido — apenas os tipos que queremos expor.
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    divider: defaultBlockSpecs.divider,
  },
})

type Schema = typeof schema

function parseInitial(value: string | null | undefined): PartialBlock<Schema['blockSchema']>[] | undefined {
  if (!value || !value.trim()) return undefined
  // Tenta JSON — se vier como array de blocos, usa direto.
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every(b => b && typeof b === 'object' && 'type' in b)) {
      return parsed as PartialBlock<Schema['blockSchema']>[]
    }
  } catch {
    // não é JSON — cai no fallback
  }
  // Legado: texto puro — quebra por linhas em blocos de parágrafo.
  const lines = value.split('\n')
  return lines.map(line => ({
    type: 'paragraph' as const,
    content: line ? [{ type: 'text' as const, text: line, styles: {} }] : [],
  }))
}

export function BlockEditor({ value, onChange, placeholder, minHeight = 120 }: {
  value: string | null | undefined
  onChange: (serialized: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const initialContent = useMemo(() => parseInitial(value), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const editor = useCreateBlockNote({
    schema,
    initialContent,
  })

  // onChange dispara quando o documento muda — serializamos como JSON.
  useEffect(() => {
    const handler = () => {
      try {
        const doc = editor.document
        onChange(JSON.stringify(doc))
      } catch {}
    }
    // API de subscribe do BlockNote
    const unsub = editor.onChange(handler)
    return () => { if (typeof unsub === 'function') unsub() }
  }, [editor, onChange])

  // Slash menu — restringe aos itens que batem com nosso schema.
  // Filtro por `key` (estável, independe de locale) em vez de `title`.
  const ALLOWED_KEYS = new Set([
    'paragraph', 'heading', 'heading_2', 'heading_3',
    'bullet_list', 'numbered_list', 'check_list', 'divider',
  ])
  const getItems = async (query: string) =>
    filterSuggestionItems(
      getDefaultReactSlashMenuItems(editor).filter(item =>
        ALLOWED_KEYS.has((item as any).key)
      ),
      query,
    )

  return (
    <div
      className="hq-block-editor"
      data-placeholder={placeholder}
      style={{ minHeight, border: '1px solid var(--color-border)', borderRadius: 3, background: 'var(--color-bg-primary)' }}
    >
      <BlockNoteView editor={editor} theme="dark" slashMenu={false}>
        <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
      </BlockNoteView>
    </div>
  )
}

export type { Block }

/**
 * Retorna `true` quando o valor serializado representa um editor vazio —
 * um único parágrafo sem conteúdo, ou string vazia/só-whitespace. Usa pra
 * decidir salvar `null` no banco em vez de JSON "vazio".
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


import { useEffect, useRef } from 'react'

/**
 * Textarea sem borda/fundo, estilo Notion: cresce verticalmente conforme o
 * texto aumenta (cada linha ou quebra de parágrafo estica a caixa). Sem
 * scrollbar interna — toda a altura é visível, quem rola é o container pai.
 *
 * Implementação: reseta `height` pra 'auto' antes de ler `scrollHeight`, pro
 * browser encolher quando linhas são deletadas.
 */
export function AutoGrowTextarea({
  value, onChange, placeholder, minHeight = 120,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`
  }

  useEffect(() => { resize() }, [value, minHeight])
  // Resize também quando o componente monta (caso o value venha async).
  useEffect(() => { resize() }, [])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => { onChange(e.target.value); resize() }}
      placeholder={placeholder}
      rows={1}
      style={{
        display: 'block', marginTop: 14, width: '100%',
        minHeight,
        background: 'transparent',
        border: 'none', outline: 'none',
        color: 'var(--color-text-primary)',
        fontSize: 14, lineHeight: 1.7,
        padding: '4px 0',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        resize: 'none',
        overflow: 'hidden',
      }}
    />
  )
}

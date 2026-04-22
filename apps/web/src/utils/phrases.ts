/**
 * User-editable motivational phrases shown on the Dashboard. Stored in
 * `localStorage['hq-motivational-phrases']`. First boot seeds a tactical
 * default set; user can add/remove freely through the Dashboard modal.
 */

export const DEFAULT_PHRASES: string[] = [
  'Sem fantasia. Só execução.',
  'Corte o ruído. Execute.',
  'Faça o dia acontecer.',
  'Sem fuga. Só avanço.',
  'Cada hora conta.',
  'Foco no essencial.',
  'Movimento, não ruído.',
  'Resultado sobre tudo.',
]

export function loadPhrases(): string[] {
  try {
    const raw = localStorage.getItem('hq-motivational-phrases')
    if (!raw) return DEFAULT_PHRASES
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) return parsed
  } catch {}
  return DEFAULT_PHRASES
}

export function savePhrases(list: string[]) {
  try { localStorage.setItem('hq-motivational-phrases', JSON.stringify(list)) } catch {}
}

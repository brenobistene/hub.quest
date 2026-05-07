/**
 * Sistema global de diálogos cyber — substitui `window.confirm` / `alert`.
 *
 * Uso:
 *   import { confirmDialog, alertDialog } from '../lib/dialog'
 *
 *   const ok = await confirmDialog({
 *     title: 'Deletar área',
 *     message: 'Tem certeza? Essa ação é irreversível.',
 *     confirmLabel: 'DELETAR',
 *     danger: true,
 *   })
 *   if (!ok) return
 *
 *   await alertDialog({ title: 'Erro', message: 'Não foi possível salvar.' })
 *
 * O renderer (`<DialogPortal />` em `components/ui/CyberDialog.tsx`) precisa
 * estar montado na árvore — feito uma vez em `App.tsx`.
 */

export type DialogVariant = 'default' | 'danger' | 'success' | 'warning'

export type DialogItem = {
  id: number
  kind: 'confirm' | 'alert'
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
  /** Resolve com `true` (confirm) ou `false` (cancel/dismiss).
   *  Para `alert`, sempre resolve com `true` no OK. */
  resolve: (ok: boolean) => void
}

let nextId = 1
const items: DialogItem[] = []
const listeners = new Set<(items: DialogItem[]) => void>()

function notify() {
  const snapshot = [...items]
  for (const l of listeners) l(snapshot)
}

export function subscribe(fn: (items: DialogItem[]) => void): () => void {
  listeners.add(fn)
  fn([...items])
  return () => { listeners.delete(fn) }
}

export function dismissDialog(id: number, ok: boolean) {
  const idx = items.findIndex(i => i.id === id)
  if (idx === -1) return
  const [item] = items.splice(idx, 1)
  item.resolve(ok)
  notify()
}

export function confirmDialog(opts: {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
  /** Atalho equivalente a `variant: 'danger'`. */
  danger?: boolean
}): Promise<boolean> {
  return new Promise(resolve => {
    items.push({
      id: nextId++,
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      variant: opts.danger ? 'danger' : (opts.variant ?? 'default'),
      resolve,
    })
    notify()
  })
}

export function alertDialog(opts: {
  title?: string
  message: string
  confirmLabel?: string
  variant?: DialogVariant
}): Promise<void> {
  return new Promise(resolve => {
    items.push({
      id: nextId++,
      kind: 'alert',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      variant: opts.variant ?? 'default',
      resolve: () => resolve(),
    })
    notify()
  })
}

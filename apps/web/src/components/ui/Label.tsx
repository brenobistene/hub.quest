import type { ReactNode } from 'react'

/**
 * Small uppercase label used across the UI for section headings and field
 * captions. Sober tactical style — no emoji, no color accents.
 */
export function Label({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 700, opacity: 0.8 }}>
      {children}
    </span>
  )
}

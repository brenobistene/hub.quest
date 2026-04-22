import type { ReactNode } from 'react'
import { Label } from './Label'

/**
 * Wrapper for a titled block with optional leading icon and bottom border.
 * Used throughout the Dia view and Dashboard to group related content.
 */
export function Section({ title, icon, children }: {
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
        {icon && <span style={{ color: 'var(--color-accent-light)', display: 'flex' }}>{icon}</span>}
        <Label>{title}</Label>
      </div>
      {children}
    </div>
  )
}

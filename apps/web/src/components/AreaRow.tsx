import { useRef, useState } from 'react'
import type { Area } from '../types'
import { updateArea, deleteArea } from '../api'
import { InlineText } from './ui/InlineText'
import { ColorPickerPopover } from './ColorPickerPopover'
import { confirmDialog, alertDialog } from '../lib/dialog'

/**
 * Row used in AreasView. Shows a colored swatch (click → color picker),
 * inline-editable name, quest + deliverable + project counts (hierarquia
 * invertida — menor primeiro), and a delete button that refuses when the
 * area still has projects linked.
 */
export function AreaRow({ area, questCount, deliverableCount, deliverableDoneCount, projectCount, onOpen, onUpdate, onDelete }: {
  area: Area
  questCount: number
  deliverableCount: number
  deliverableDoneCount: number
  projectCount: number
  onOpen: () => void
  onUpdate: (slug: string, patch: Partial<Area>) => void
  onDelete: (slug: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [hover, setHover] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (projectCount > 0) {
      await alertDialog({
        title: 'Área com projetos vinculados',
        message: `Esta área tem ${projectCount} projeto${projectCount !== 1 ? 's' : ''} vinculado${projectCount !== 1 ? 's' : ''}. Mova ou delete antes.`,
        variant: 'warning',
      })
      return
    }
    const ok = await confirmDialog({
      title: 'Deletar área',
      message: `Deletar a área "${area.name}"?\nEssa ação é irreversível.`,
      confirmLabel: 'DELETAR',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteArea(area.slug)
      onDelete(area.slug)
    } catch (err: any) {
      await alertDialog({
        title: 'Erro',
        message: err?.detail ?? 'Erro ao deletar área',
        variant: 'danger',
      })
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 14px',
        background: 'rgba(8, 12, 18, 0.55)',
        border: '1px solid rgba(143, 191, 211, 0.22)',
        borderLeft: `2px solid ${area.color}`,
        borderRadius: 0,
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        transition: 'background var(--motion-fast) var(--ease-smooth), border-color var(--motion-fast) var(--ease-smooth), box-shadow var(--motion-fast) var(--ease-smooth), transform var(--motion-fast) var(--ease-smooth)',
      }}
      onMouseEnter={(e) => {
        setHover(true)
        e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.45)'
        e.currentTarget.style.boxShadow = `0 0 12px ${area.color}33`
        e.currentTarget.style.transform = 'translateX(2px)'
      }}
      onMouseLeave={(e) => {
        setHover(false)
        e.currentTarget.style.borderColor = 'rgba(143, 191, 211, 0.22)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
        <button
          ref={swatchRef}
          onClick={() => setShowPicker(o => !o)}
          title="alterar cor"
          style={{
            width: 22, height: 22, background: area.color,
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: 0,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)',
            cursor: 'pointer', padding: 0,
            boxShadow: `0 0 18px ${area.color}cc, 0 0 8px ${area.color}aa, 0 0 3px ${area.color}`,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.1)'
            e.currentTarget.style.boxShadow = `0 0 26px ${area.color}, 0 0 12px ${area.color}, 0 0 4px ${area.color}`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = `0 0 18px ${area.color}cc, 0 0 8px ${area.color}aa, 0 0 3px ${area.color}`
          }}
        />
        {showPicker && (
          <ColorPickerPopover
            value={area.color}
            anchorEl={swatchRef.current}
            onChange={(hex) => {
              updateArea(area.slug, { color: hex })
                .then(() => onUpdate(area.slug, { color: hex }))
                .catch(() => alertDialog({ title: 'Erro', message: 'Erro ao atualizar cor', variant: 'danger' }))
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div onClick={e => e.stopPropagation()}>
            <InlineText
              value={area.name}
              onSave={v => {
                updateArea(area.slug, { name: v })
                  .then(() => onUpdate(area.slug, { name: v }))
                  .catch(() => alertDialog({ title: 'Erro', message: 'Erro ao renomear área', variant: 'danger' }))
              }}
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            />
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9, fontWeight: 700,
            color: 'var(--color-ice-light)',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span>
              <span style={{ color: 'var(--color-ice)', opacity: 0.85, marginRight: 4, letterSpacing: 0 }}>//</span>
              {questCount.toString().padStart(2, '0')} {questCount === 1 ? 'QUEST' : 'QUESTS'}
            </span>
            <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>·</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              {deliverableCount.toString().padStart(2, '0')} {deliverableCount === 1 ? 'ENTREGÁVEL' : 'ENTREGÁVEIS'}
            </span>
            <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>·</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              {projectCount.toString().padStart(2, '0')} {projectCount === 1 ? 'PROJETO' : 'PROJETOS'}
            </span>
            {deliverableCount > 0 && (
              <>
                <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>·</span>
                <span style={{
                  color: deliverableDoneCount === deliverableCount
                    ? 'var(--color-success-light)'
                    : 'var(--color-text-tertiary)',
                }}>
                  {Math.round((deliverableDoneCount / deliverableCount) * 100)}%
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={questCount > 0}
        title={questCount > 0 ? 'Área tem quests vinculadas' : 'deletar área'}
        style={{
          background: 'none', border: 'none',
          fontFamily: 'var(--font-mono)',
          color: questCount > 0
            ? 'var(--color-text-muted)'
            : (hover ? 'var(--color-text-tertiary)' : 'transparent'),
          cursor: questCount > 0 ? 'not-allowed' : 'pointer',
          padding: '4px 8px', fontSize: 14, flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { if (questCount === 0) e.currentTarget.style.color = 'var(--color-accent-light)' }}
        onMouseLeave={e => { if (questCount === 0) e.currentTarget.style.color = hover ? 'var(--color-text-tertiary)' : 'transparent' }}
      >
        ✕
      </button>
    </div>
  )
}

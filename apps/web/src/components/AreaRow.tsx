import { useState } from 'react'
import type { Area } from '../types'
import { updateArea, deleteArea } from '../api'
import { InlineText } from './ui/InlineText'
import { ColorPickerPopover } from './ColorPickerPopover'

/**
 * Row used in AreasView. Shows a colored swatch (click → color picker),
 * inline-editable name + description, quest count, and a delete button
 * that refuses when the area still has quests linked.
 */
export function AreaRow({ area, questCount, onOpen, onUpdate, onDelete }: {
  area: Area
  questCount: number
  onOpen: () => void
  onUpdate: (slug: string, patch: Partial<Area>) => void
  onDelete: (slug: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [hover, setHover] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (questCount > 0) {
      alert(`Esta área tem ${questCount} quest${questCount !== 1 ? 's' : ''} vinculada${questCount !== 1 ? 's' : ''}. Mova ou delete antes.`)
      return
    }
    if (!window.confirm(`Deletar a área "${area.name}"?`)) return
    try {
      await deleteArea(area.slug)
      onDelete(area.slug)
    } catch (err: any) {
      alert(err?.detail ?? 'Erro ao deletar área')
    }
  }

  return (
    <div
      style={{
        padding: '16px 0', borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'flex-start', gap: 14,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ position: 'relative', flexShrink: 0, marginTop: 2 }}>
        <button
          onClick={() => setShowPicker(o => !o)}
          title="alterar cor"
          style={{
            width: 18, height: 18, background: area.color,
            border: '1px solid var(--color-border)', borderRadius: 4,
            cursor: 'pointer', padding: 0,
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        />
        {showPicker && (
          <ColorPickerPopover
            value={area.color}
            onChange={(hex) => {
              updateArea(area.slug, { color: hex })
                .then(() => onUpdate(area.slug, { color: hex }))
                .catch(() => alert('Erro ao atualizar cor'))
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={e => e.stopPropagation()}>
            <InlineText
              value={area.name}
              onSave={v => {
                updateArea(area.slug, { name: v })
                  .then(() => onUpdate(area.slug, { name: v }))
                  .catch(() => alert('Erro ao renomear área'))
              }}
              style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 13 }}
            />
          </div>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {questCount} quest{questCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
          <InlineText
            value={area.description ?? ''}
            onSave={v => {
              updateArea(area.slug, { description: v })
                .then(() => onUpdate(area.slug, { description: v }))
                .catch(() => alert('Erro ao atualizar descrição'))
            }}
            style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'block' }}
          />
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={questCount > 0}
        title={questCount > 0 ? 'Área tem quests vinculadas' : 'deletar área'}
        style={{
          background: 'none', border: 'none',
          color: questCount > 0 ? 'var(--color-text-muted)' : (hover ? 'var(--color-text-tertiary)' : 'transparent'),
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

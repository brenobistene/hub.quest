import { useState } from 'react'
import type { Profile } from '../types'
import { updateProfile } from '../api'
import { Label } from './ui/Label'

/**
 * Modal reached from the Dashboard profile block. Edits name, role and
 * avatar URL. Avatar accepts both relative paths (`/file.jpg` resolved
 * from `public/`) and full URLs.
 */
export function ProfileEditModal({ profile, onClose, onSave }: {
  profile: Profile
  onClose: () => void
  onSave: (p: Profile) => void
}) {
  const [name, setName] = useState(profile.name)
  const [role, setRole] = useState(profile.role)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateProfile({ name, role, avatar_url: avatarUrl })
      onSave(updated)
      onClose()
    } catch {
      alert('Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 6, padding: 24, minWidth: 380, maxWidth: 480,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label>editar perfil</Label>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 14, padding: '2px 8px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt="preview"
              style={{
                width: 60, height: 60, borderRadius: '50%',
                border: '2px solid var(--color-border)', objectFit: 'cover',
                background: 'var(--color-bg-tertiary)', flexShrink: 0,
              }}
              onError={e => { (e.currentTarget.style.visibility = 'hidden') }}
            />
          )}
          <div style={{ flex: 1, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            Use <code>/arquivo.jpg</code> (em <code>apps/web/public/</code>) ou uma URL completa <code>https://…</code>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>nome</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)', fontSize: 13, padding: '8px 10px', borderRadius: 3,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>cargo</div>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{
              width: '100%', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)', fontSize: 13, padding: '8px 10px', borderRadius: 3,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>foto (url)</div>
          <input
            value={avatarUrl}
            onChange={e => setAvatarUrl(e.target.value)}
            placeholder="/minha-foto.jpg ou https://..."
            style={{
              width: '100%', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)', fontSize: 13, padding: '8px 10px', borderRadius: 3,
              outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', fontSize: 11, padding: '8px 14px', borderRadius: 3,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--color-accent-primary)',
              color: 'var(--color-bg-primary)',
              border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 11, padding: '8px 16px', borderRadius: 3, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

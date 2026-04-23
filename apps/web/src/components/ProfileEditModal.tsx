import { useRef, useState } from 'react'
import type { Profile } from '../types'
import { updateProfile } from '../api'
import { Label } from './ui/Label'

/**
 * Modal reached from the Dashboard profile block. Edits name, role and
 * avatar. Avatar aceita tanto um upload local (lido como data URL base64)
 * quanto um path relativo `/file.jpg` (resolvido de `public/`) ou URL
 * completa `https://…`.
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { alert('Selecione uma imagem.'); return }
    if (f.size > 2 * 1024 * 1024) { alert('Imagem grande demais (máx 2 MB).'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') setAvatarUrl(result)
    }
    reader.readAsDataURL(f)
  }

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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFilePick}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', cursor: 'pointer',
                  color: 'var(--color-text-secondary)', fontSize: 10, padding: '6px 10px', borderRadius: 3,
                  letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
                }}
              >
                Enviar foto
              </button>
              {avatarUrl && (
                <button
                  onClick={() => setAvatarUrl('')}
                  style={{
                    background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer',
                    color: 'var(--color-text-tertiary)', fontSize: 10, padding: '6px 10px', borderRadius: 3,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}
                >
                  Remover
                </button>
              )}
            </div>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              Ou preencha um path/URL no campo abaixo. Limite do upload: 2 MB.
            </div>
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

import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Profile } from '../types'
import { updateProfile } from '../api'
import { ModalFrame, IconButton, Button } from './ui/Primitives'

/**
 * Modal reached from the Dashboard profile block. Edits name, role and
 * avatar. Avatar aceita tanto um upload local (lido como data URL base64)
 * quanto um path relativo `/file.jpg` (resolvido de `public/`) ou URL
 * completa `https://…`.
 *
 * Refator (ui-ux-pro-max): usa <ModalFrame> + <IconButton> + <Button>
 * pra entrance animation + glass + chrome consistente com o resto.
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
    <ModalFrame onClose={onClose} minWidth={400} maxWidth={500}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          editar perfil
        </div>
        <IconButton label="fechar" onClick={onClose} variant="bare">
          <X size={14} strokeWidth={1.8} />
        </IconButton>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt="preview"
              style={{
                width: 60, height: 60, borderRadius: '50%',
                border: '1px solid var(--color-border-chrome)', objectFit: 'cover',
                background: 'var(--glass-bg)', flexShrink: 0,
              }}
              onError={e => { (e.currentTarget.style.visibility = 'hidden') }}
            />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFilePick}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                Enviar foto
              </Button>
              {avatarUrl && (
                <Button variant="ghost" onClick={() => setAvatarUrl('')}>
                  Remover
                </Button>
              )}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Ou preencha um path/URL no campo abaixo. Limite do upload: 2 MB.
            </div>
          </div>
        </div>

        <FieldGroup label="nome">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputCss}
          />
        </FieldGroup>

        <FieldGroup label="cargo">
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            style={inputCss}
          />
        </FieldGroup>

        <FieldGroup label="foto (url)">
          <input
            value={avatarUrl}
            onChange={e => setAvatarUrl(e.target.value)}
            placeholder="/minha-foto.jpg ou https://..."
            style={{ ...inputCss, fontFamily: 'var(--font-mono)' }}
          />
        </FieldGroup>

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </ModalFrame>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-tertiary)',
        marginBottom: 'var(--space-1)',
        fontWeight: 500,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const inputCss: React.CSSProperties = {
  width: '100%',
  background: 'var(--glass-bg)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-sm)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-body)',
}

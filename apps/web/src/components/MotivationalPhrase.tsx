import { useState } from 'react'
import { loadPhrases, savePhrases } from '../utils/phrases'
import { Label } from './ui/Label'

/**
 * Italic phrase shown at the top of the Dashboard. Cycles deterministically
 * through the user's list by `day-of-month % count`. The `✎` icon opens a
 * modal to add/remove entries. Persisted in localStorage.
 */
export function MotivationalPhrase() {
  const [phrases, setPhrases] = useState<string[]>(() => loadPhrases())
  const [managing, setManaging] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')

  const today = new Date()
  const todayPhrase = phrases.length > 0
    ? phrases[today.getDate() % phrases.length]
    : ''

  function addPhrase() {
    const trimmed = newPhrase.trim()
    if (!trimmed) return
    const next = [...phrases, trimmed]
    setPhrases(next)
    savePhrases(next)
    setNewPhrase('')
  }

  function removePhrase(idx: number) {
    const next = phrases.filter((_, i) => i !== idx)
    setPhrases(next)
    savePhrases(next)
  }

  if (phrases.length === 0 && !managing) {
    return (
      <button
        onClick={() => setManaging(true)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-tertiary)', fontSize: 12, fontStyle: 'italic',
          padding: 0, marginBottom: 18, textAlign: 'left',
        }}
      >
        + adicionar frase do dia
      </button>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: 'var(--color-accent-light)', fontWeight: 500, fontStyle: 'italic' }}>
          "{todayPhrase}"
        </div>
        <button
          onClick={() => setManaging(true)}
          title="gerenciar frases"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: 11,
            padding: '2px 6px', borderRadius: 3,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          ✎
        </button>
      </div>

      {managing && (
        <div
          onClick={() => setManaging(false)}
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
              borderRadius: 6, padding: 24, minWidth: 360, maxWidth: 480, maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Label>frases do dia</Label>
              <button
                onClick={() => setManaging(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)', fontSize: 14, padding: '2px 8px',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Uma frase por dia do mês (gira por <code>dia % total</code>). Salvas só no navegador.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '40vh' }}>
              {phrases.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderBottom: '1px solid var(--color-border)',
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-primary)' }}>{p}</span>
                  <button
                    onClick={() => removePhrase(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-muted)', fontSize: 11, padding: '2px 6px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-light)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {phrases.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', padding: 8 }}>
                  Sem frases. Adicione uma abaixo.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newPhrase}
                onChange={e => setNewPhrase(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addPhrase() }}
                placeholder="Nova frase..."
                style={{
                  flex: 1, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)', fontSize: 12, padding: '8px 10px', borderRadius: 3,
                  outline: 'none',
                }}
              />
              <button
                onClick={addPhrase}
                disabled={!newPhrase.trim()}
                style={{
                  background: newPhrase.trim() ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
                  color: newPhrase.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                  border: 'none', cursor: newPhrase.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 11, padding: '0 14px', borderRadius: 3, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

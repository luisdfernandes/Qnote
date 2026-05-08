import { useState } from 'react'

const THEMES = [
  { id: 'darker', label: 'Darker',  swatch: '#111' },
  { id: 'dark',   label: 'Dark',    swatch: '#1e1e1e' },
  { id: 'dimmed', label: 'Dimmed',  swatch: '#2b2b2b' },
  { id: 'light',  label: 'Light',   swatch: '#f0f0f0' },
]

const ACCENTS = [
  { id: 'mint',   label: 'Mint',     color: '#4ec9b0', dim: '#3aab96' },
  { id: 'cyan',   label: 'Cyan',     color: '#00d4d4', dim: '#00a8a8' },
  { id: 'blue',   label: 'Blue',     color: '#4a9eff', dim: '#2d80e0' },
  { id: 'purple', label: 'Purple',   color: '#b07cff', dim: '#9560e0' },
  { id: 'pink',   label: 'Pink',     color: '#ff5ea8', dim: '#e0408a' },
  { id: 'orange', label: 'Orange',   color: '#ff9f43', dim: '#e0832c' },
  { id: 'gold',   label: 'Gold',     color: '#f1c40f', dim: '#d4ac0d' },
  { id: 'lime',   label: 'Lime',     color: '#a3e048', dim: '#88c038' },
]

const FONTS = [
  { id: 'system',  label: 'System default', preview: 'sans-serif' },
  { id: 'calibri', label: 'Calibri',        preview: 'Calibri, sans-serif' },
  { id: 'verdana', label: 'Verdana',        preview: 'Verdana, sans-serif' },
  { id: 'serif',   label: 'Georgia (serif)',preview: 'Georgia, serif' },
  { id: 'mono',    label: 'Monospace',      preview: 'Consolas, monospace' },
]

export default function Settings({ config, onSave, onClose, canClose }) {
  const [form, setForm] = useState({
    owner:  config?.owner  || '',
    repo:   config?.repo   || '',
    folder: config?.folder ?? 'notes',
    branch: config?.branch || 'main',
    token:  config?.token  || '',
    theme:  config?.theme  || 'dark',
    accent: config?.accent || 'mint',
    font:   config?.font   || 'system',
    zoom:   config?.zoom   ?? 1,
  })
  const [showToken, setShowToken] = useState(false)
  const [testState, setTestState] = useState(null)

  const set = (key) => (e) => {
    setTestState(null)
    setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  const pick = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }))
    // live-preview theme/font while modal is open
    if (key === 'theme') document.documentElement.setAttribute('data-theme', val)
    if (key === 'font') {
      const stacks = {
        system:  "'Segoe UI', -apple-system, sans-serif",
        serif:   "Georgia, serif",
        mono:    "Consolas, monospace",
        calibri: "Calibri, sans-serif",
        verdana: "Verdana, sans-serif",
      }
      document.documentElement.style.setProperty('--font-content', stacks[val])
    }
    if (key === 'zoom') {
      window.api.zoom.set(val)
    }
    if (key === 'accent') {
      const a = ACCENTS.find(x => x.id === val)
      if (a) {
        document.documentElement.style.setProperty('--accent', a.color)
        document.documentElement.style.setProperty('--accent-dim', a.dim)
      }
    }
  }

  function adjustZoom(delta) {
    const next = Math.round((form.zoom + delta) * 10) / 10
    if (next < 0.5 || next > 2.0) return
    pick('zoom', next)
  }

  async function handleTest() {
    setTestState('loading')
    try {
      const info = await window.api.github.testConnection(form)
      setTestState({
        ok: true,
        msg: `Connected to ${info.full_name} (${info.private ? 'private' : 'public'}) · default branch: ${info.default_branch}`,
      })
    } catch (e) {
      setTestState({ ok: false, msg: e.message })
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <div className="overlay" onClick={canClose ? onClose : undefined}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          {canClose && (
            <button className="btn-icon" onClick={onClose}>×</button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── GitHub ── */}
          <div className="settings-section-label">GitHub</div>

          <div className="field-row">
            <div className="field">
              <label>Username / Org</label>
              <input type="text" value={form.owner} onChange={set('owner')}
                placeholder="octocat" required autoFocus />
            </div>
            <div className="field">
              <label>Repository</label>
              <input type="text" value={form.repo} onChange={set('repo')}
                placeholder="my-notes" required />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Notes Folder</label>
              <input type="text" value={form.folder} onChange={set('folder')}
                placeholder="notes" />
              <span className="hint">Leave empty for repo root</span>
            </div>
            <div className="field">
              <label>Branch</label>
              <input type="text" value={form.branch} onChange={set('branch')}
                placeholder="main" />
            </div>
          </div>

          <div className="field">
            <label>Personal Access Token</label>
            <div className="token-row">
              <input type={showToken ? 'text' : 'password'} value={form.token}
                onChange={set('token')} placeholder="ghp_…" required />
              <button type="button" className="btn btn-ghost"
                onClick={() => setShowToken(v => !v)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <span className="hint">
              Needs <code>repo</code> scope.{' '}
              <a href="https://github.com/settings/tokens/new?scopes=repo&description=QNote"
                target="_blank" rel="noreferrer">
                Generate token →
              </a>
            </span>
          </div>

          {testState && testState !== 'loading' && (
            <div className={`test-result ${testState.ok ? 'test-ok' : 'test-fail'}`}>
              {testState.ok ? '✓' : '✗'} {testState.msg}
            </div>
          )}

          {/* ── Appearance ── */}
          <div className="settings-section-label" style={{ marginTop: 24 }}>
            Appearance
          </div>

          <div className="field">
            <label>Theme</label>
            <div className="theme-picker">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-swatch ${form.theme === t.id ? 'selected' : ''}`}
                  onClick={() => pick('theme', t.id)}
                  style={{ background: t.swatch }}
                  title={t.label}
                >
                  <span className="swatch-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Accent color</label>
            <div className="accent-picker">
              {ACCENTS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className={`accent-swatch ${form.accent === a.id ? 'selected' : ''}`}
                  onClick={() => pick('accent', a.id)}
                  style={{ background: a.color, color: a.color }}
                  title={a.label}
                  aria-label={a.label}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <label>Editor &amp; Preview Font</label>
            <div className="font-picker">
              {FONTS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`font-option ${form.font === f.id ? 'selected' : ''}`}
                  style={{ fontFamily: f.preview }}
                  onClick={() => pick('font', f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Zoom</label>
            <div className="zoom-control">
              <button type="button" className="zoom-btn" onClick={() => adjustZoom(-0.1)}
                disabled={form.zoom <= 0.5}>−</button>
              <span className="zoom-value">{Math.round(form.zoom * 100)}%</span>
              <button type="button" className="zoom-btn" onClick={() => adjustZoom(0.1)}
                disabled={form.zoom >= 2.0}>+</button>
              {form.zoom !== 1 && (
                <button type="button" className="btn btn-ghost zoom-reset"
                  onClick={() => pick('zoom', 1)}>Reset</button>
              )}
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost"
              onClick={handleTest} disabled={testState === 'loading'}>
              {testState === 'loading' ? 'Testing…' : 'Test Connection'}
            </button>
            <div style={{ flex: 1 }} />
            {canClose && (
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              Save &amp; Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

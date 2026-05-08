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

function genId() {
  return 'src_' + Math.random().toString(36).slice(2, 9)
}

function initialSources(cfg) {
  if (Array.isArray(cfg?.sources) && cfg.sources.length > 0) return cfg.sources.map(s => ({ ...s }))
  return [{ id: 'notes', name: 'Notes', folder: cfg?.folder ?? 'notes', kind: 'notes' }]
}

export default function Settings({ config, onSave, onClose, canClose }) {
  const [form, setForm] = useState({
    owner:  config?.owner  || '',
    repo:   config?.repo   || '',
    branch: config?.branch || 'main',
    token:  config?.token  || '',
    theme:  config?.theme  || 'dark',
    accent: config?.accent || 'mint',
    font:   config?.font   || 'system',
    zoom:   config?.zoom   ?? 1,
    sources: initialSources(config),
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
    const cleanSources = form.sources
      .map(s => ({
        id: s.id || genId(),
        name: (s.name || '').trim() || 'Untitled',
        folder: (s.folder || '').replace(/^\/|\/$/g, ''),
        kind: s.kind === 'files' ? 'files' : 'notes',
      }))
    // Ensure unique ids
    const seen = new Set()
    for (const s of cleanSources) {
      while (seen.has(s.id)) s.id = genId()
      seen.add(s.id)
    }
    onSave({ ...form, sources: cleanSources })
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

          <div className="field">
            <label>Branch</label>
            <input type="text" value={form.branch} onChange={set('branch')}
              placeholder="main" />
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

          {/* ── Sections / Folders ── */}
          <div className="settings-section-label" style={{ marginTop: 24 }}>
            Sections
          </div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
            Each section appears as a collapsible group in the sidebar. Notes sections show only <code>.md</code> files
            with categories and the markdown editor. Files sections show any file type with upload, view, edit and delete.
          </p>
          <div className="sources-list">
            {form.sources.map((src, idx) => (
              <div key={src.id} className="source-row">
                <input
                  type="text"
                  className="source-name-input"
                  value={src.name}
                  placeholder="Section name"
                  onChange={e => {
                    const v = e.target.value
                    setForm(prev => ({
                      ...prev,
                      sources: prev.sources.map((s, i) => i === idx ? { ...s, name: v } : s),
                    }))
                  }}
                />
                <input
                  type="text"
                  className="source-folder-input"
                  value={src.folder}
                  placeholder="folder/path"
                  onChange={e => {
                    const v = e.target.value
                    setForm(prev => ({
                      ...prev,
                      sources: prev.sources.map((s, i) => i === idx ? { ...s, folder: v } : s),
                    }))
                  }}
                />
                <select
                  className="source-kind-select"
                  value={src.kind}
                  onChange={e => {
                    const v = e.target.value
                    setForm(prev => ({
                      ...prev,
                      sources: prev.sources.map((s, i) => i === idx ? { ...s, kind: v } : s),
                    }))
                  }}
                >
                  <option value="notes">Notes</option>
                  <option value="files">Files</option>
                </select>
                <button
                  type="button"
                  className="btn-icon"
                  title="Move up"
                  disabled={idx === 0}
                  onClick={() => {
                    setForm(prev => {
                      const next = [...prev.sources]
                      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                      return { ...prev, sources: next }
                    })
                  }}
                >↑</button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Move down"
                  disabled={idx === form.sources.length - 1}
                  onClick={() => {
                    setForm(prev => {
                      const next = [...prev.sources]
                      ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                      return { ...prev, sources: next }
                    })
                  }}
                >↓</button>
                <button
                  type="button"
                  className="btn-icon source-remove"
                  title="Remove section"
                  disabled={form.sources.length <= 1}
                  onClick={() => {
                    setForm(prev => ({
                      ...prev,
                      sources: prev.sources.filter((_, i) => i !== idx),
                    }))
                  }}
                >×</button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost source-add"
              onClick={() => {
                setForm(prev => ({
                  ...prev,
                  sources: [...prev.sources, { id: genId(), name: 'New section', folder: '', kind: 'files' }],
                }))
              }}
            >+ Add section</button>
          </div>

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

import { useState, useRef, useEffect } from 'react'

function relative(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (isNaN(d.getTime())) return null
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)     return 'just now'
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

function absolute(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return isNaN(d.getTime()) ? '' : d.toLocaleString()
}

export default function Toolbar({
  activeFile,
  isDirty,
  mode,
  loading,
  status,
  meta,
  onMetaChange,
  onModeToggle,
  onSave,
  onOpenGitHub,
  onShareUrl,
  onRequestDelete,
}) {
  const categories = Array.isArray(meta?.categories) ? meta.categories : []
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const editable = !!activeFile && mode === 'edit'

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  function commitAdd() {
    const value = draft.trim().replace(/[,\[\]]/g, '')
    setDraft('')
    setAdding(false)
    if (!value || categories.includes(value)) return
    onMetaChange?.({ ...meta, categories: [...categories, value] })
  }

  function removeCategory(tag) {
    onMetaChange?.({ ...meta, categories: categories.filter(t => t !== tag) })
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {isDirty && <span className="dirty-dot" title="Unsaved changes" />}

        {activeFile && (
          <div className="toolbar-categories">
            {categories.map(tag => (
              <span key={tag} className="meta-chip">
                {tag}
                {editable && (
                  <button
                    type="button"
                    className="meta-chip-remove"
                    onClick={() => removeCategory(tag)}
                    title={`Remove "${tag}"`}
                  >×</button>
                )}
              </span>
            ))}
            {editable && (
              adding ? (
                <input
                  ref={inputRef}
                  className="meta-add-input"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitAdd}
                  onKeyDown={e => {
                    if (e.key === 'Enter')      { e.preventDefault(); commitAdd() }
                    else if (e.key === 'Escape') { setDraft(''); setAdding(false) }
                  }}
                  placeholder="category"
                />
              ) : (
                <button
                  type="button"
                  className="meta-add-btn"
                  onClick={() => setAdding(true)}
                  title="Add category"
                >+ category</button>
              )
            )}
          </div>
        )}

        {activeFile && (meta?.created || meta?.modified) && (
          <span className="toolbar-dates">
            {meta?.created && (
              <span title={`Created ${absolute(meta.created)}`}>
                <span className="meta-key">Created</span> {relative(meta.created)}
              </span>
            )}
            {meta?.modified && (
              <span title={`Modified ${absolute(meta.modified)}`}>
                <span className="meta-key">Modified</span> {relative(meta.modified)}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        {status && <span className="status-msg">{status}</span>}

        {activeFile && (
          <>
            <button
              className="btn-icon toolbar-mode-btn"
              onClick={onShareUrl}
              title="Copy GitHub link"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
                <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>
              </svg>
            </button>

            <button
              className="btn-icon toolbar-mode-btn"
              onClick={onOpenGitHub}
              title="Open on GitHub"
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </button>

            <button
              className={`btn-icon toolbar-mode-btn ${mode === 'view' ? 'is-active' : ''}`}
              onClick={onModeToggle}
              title={mode === 'edit' ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)'}
            >
              {mode === 'edit' ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
            </button>

            {mode === 'edit' && (
              <button
                className="btn-icon toolbar-delete-btn"
                onClick={onRequestDelete}
                disabled={loading}
                title="Delete note"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}

            <button
              className="btn btn-primary"
              onClick={onSave}
              disabled={!isDirty || loading}
              title="Save (Ctrl+S)"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  )
}

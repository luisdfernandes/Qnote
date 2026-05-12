import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

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
  onShareAsGist,
  onRevokeGist,
  activeGist,
  onDownload,
  onRequestDelete,
  allCategories = [],
  managedCategories = [],
  onSaveManagedCategories,
}) {
  const categories = [...new Set(Array.isArray(meta?.categories) ? meta.categories : [])]
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const anchorRef = useRef(null)
  const pickerRef = useRef(null)
  const inputRef = useRef(null)
  const editable = !!activeFile && mode === 'view'

  // Callback ref: focus the moment the input is attached. Runs synchronously on
  // mount, which avoids races with ProseMirror's contenteditable focus.
  const attachInput = (el) => {
    inputRef.current = el
    if (el) {
      el.focus({ preventScroll: true })
      // Belt-and-suspenders for Electron/Chromium: re-focus on the next frame
      // in case something steals focus during the same tick.
      requestAnimationFrame(() => {
        if (document.activeElement !== el) el.focus({ preventScroll: true })
      })
    }
  }

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) {
        setPickerOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  function openPicker() {
    if (pickerOpen) { setPickerOpen(false); setFilter(''); return }
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) setPickerPos({ top: rect.bottom + 4, left: rect.left })
    setPickerOpen(true)
  }

  function toggleNoteCategory(tag) {
    const next = categories.includes(tag)
      ? categories.filter(t => t !== tag)
      : [...categories, tag]
    onMetaChange?.({ ...meta, categories: next })
  }

  function removeNoteCategory(tag) {
    onMetaChange?.({ ...meta, categories: categories.filter(t => t !== tag) })
  }

  async function addToList() {
    const val = filter.trim().replace(/[,\[\]]/g, '')
    if (!val) return
    setFilter('')
    const alreadyInList = managedCategories.some(c => c.toLowerCase() === val.toLowerCase())
    const newList = alreadyInList ? managedCategories : [...managedCategories, val]
    if (!alreadyInList) {
      setSaving(true)
      await onSaveManagedCategories?.(newList)
      setSaving(false)
    }
    // Also add to current note if not already there
    if (!categories.includes(val)) {
      onMetaChange?.({ ...meta, categories: [...categories, val] })
    }
  }

  async function removeFromList(tag) {
    const newList = managedCategories.filter(t => t !== tag)
    setSaving(true)
    await onSaveManagedCategories?.(newList)
    setSaving(false)
    // Also remove from current note if present
    if (categories.includes(tag)) {
      onMetaChange?.({ ...meta, categories: categories.filter(t => t !== tag) })
    }
  }

  const suggestions = allCategories.filter(c =>
    c.toLowerCase().includes(filter.toLowerCase())
  )
  const canAdd = filter.trim() && !allCategories.some(
    c => c.toLowerCase() === filter.trim().toLowerCase()
  )
  const isInManagedList = (tag) => managedCategories.includes(tag)

  const picker = pickerOpen ? createPortal(
    <div
      ref={pickerRef}
      className="cat-picker"
      style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left }}
    >
      <input
        ref={attachInput}
        className="cat-picker-input"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); addToList() }
          else if (e.key === 'Escape') { setPickerOpen(false); setFilter('') }
        }}
        placeholder="Search or type new…"
      />
      <div className="cat-picker-list">
        {suggestions.map(tag => (
          <div key={tag} className="cat-picker-row">
            <button
              type="button"
              className={`cat-picker-item${categories.includes(tag) ? ' is-selected' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => toggleNoteCategory(tag)}
            >
              <span className="cat-picker-check">{categories.includes(tag) ? '✓' : ''}</span>
              {tag}
            </button>
            {isInManagedList(tag) ? (
              <button
                type="button"
                className="cat-picker-delete"
                onMouseDown={e => e.preventDefault()}
                onClick={() => removeFromList(tag)}
                title="Remove from saved list"
              >×</button>
            ) : (
              <button
                type="button"
                className="cat-picker-save-tag"
                onMouseDown={e => e.preventDefault()}
                onClick={async () => {
                  setSaving(true)
                  await onSaveManagedCategories?.([...managedCategories, tag])
                  setSaving(false)
                }}
                title="Save to list"
              >+</button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            className="cat-picker-item cat-picker-new"
            onMouseDown={e => e.preventDefault()}
            onClick={addToList}
          >
            <span className="cat-picker-check">+</span>
            Add "{filter.trim()}"
          </button>
        )}
        {suggestions.length === 0 && !canAdd && (
          <div className="cat-picker-empty">
            {allCategories.length === 0 ? 'Type a name and press Enter' : 'No matches — press Enter to add'}
          </div>
        )}
      </div>
      {saving && <div className="cat-picker-footer">Saving…</div>}
    </div>,
    document.body
  ) : null

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
                    onClick={() => removeNoteCategory(tag)}
                    title={`Remove "${tag}" from this note`}
                  >×</button>
                )}
              </span>
            ))}
            {editable && (
              <>
                <button
                  ref={anchorRef}
                  type="button"
                  className="meta-add-btn"
                  onClick={openPicker}
                  title="Add category"
                >+ category</button>
                {picker}
              </>
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
              className={`btn-icon toolbar-mode-btn${activeGist ? ' is-active' : ''}`}
              onClick={e => e.shiftKey ? onRevokeGist?.() : onShareAsGist?.()}
              title={activeGist ? 'Copy share link (Shift+click to revoke)' : 'Share as secret Gist'}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>

            <button
              className="btn-icon toolbar-mode-btn"
              onClick={onDownload}
              title="Download"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
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

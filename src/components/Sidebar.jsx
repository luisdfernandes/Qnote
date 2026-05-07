import { useState, useRef, useEffect } from 'react'

export default function Sidebar({
  files,
  activeFile,
  loading,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onSettingsOpen,
}) {
  const [newFileName, setNewFileName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (showNewInput) inputRef.current?.focus()
  }, [showNewInput])

  function handleCreate(e) {
    e.preventDefault()
    const name = newFileName.trim()
    if (!name) return
    onFileCreate(name)
    setNewFileName('')
    setShowNewInput(false)
  }

  function handleDeleteClick(e, file) {
    e.stopPropagation()
    setDeleteTarget(file)
  }

  function confirmDelete() {
    if (deleteTarget) onFileDelete(deleteTarget)
    setDeleteTarget(null)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="brand">QNote</span>
        <button
          className="btn-icon"
          onClick={() => setShowNewInput(v => !v)}
          title="New note"
        >
          +
        </button>
      </div>

      {showNewInput && (
        <form className="new-file-form" onSubmit={handleCreate}>
          <input
            ref={inputRef}
            type="text"
            placeholder="filename.md"
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowNewInput(false)
                setNewFileName('')
              }
            }}
          />
        </form>
      )}

      <div className="file-list">
        {loading && files.length === 0 && (
          <div className="hint">Loading…</div>
        )}
        {!loading && files.length === 0 && (
          <div className="hint">No notes yet</div>
        )}
        {files.map(file => (
          <div
            key={file.path}
            className={`file-item ${activeFile?.path === file.path ? 'active' : ''}`}
            onClick={() => onFileSelect(file)}
          >
            <span className="file-label">
              {file.name.replace(/\.md$/, '')}
            </span>
            <button
              className="file-del"
              onClick={e => handleDeleteClick(e, file)}
              title="Delete"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="btn-icon" onClick={onSettingsOpen} title="Settings">
          ⚙
        </button>
      </div>

      {deleteTarget && (
        <div className="overlay" onClick={() => setDeleteTarget(null)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <p>Delete <strong>{deleteTarget.name}</strong>?</p>
            <p className="dialog-sub">This will remove it from GitHub and cannot be undone.</p>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

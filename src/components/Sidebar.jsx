import { useState, useRef, useEffect } from 'react'

function buildTree(files) {
  const root = []
  const folderMap = {}

  const sorted = [...files].sort((a, b) =>
    (a.relativePath || a.name).localeCompare(b.relativePath || b.name),
  )

  for (const file of sorted) {
    const rel = file.relativePath || file.name
    const parts = rel.split('/')
    if (parts.length === 1) {
      root.push({ type: 'file', ...file })
    } else {
      let currentLevel = root
      let key = ''
      for (let i = 0; i < parts.length - 1; i++) {
        const segment = parts[i]
        key = key ? `${key}/${segment}` : segment
        if (!folderMap[key]) {
          const node = { type: 'folder', name: segment, key, children: [] }
          folderMap[key] = node
          currentLevel.push(node)
        }
        currentLevel = folderMap[key].children
      }
      currentLevel.push({ type: 'file', ...file })
    }
  }

  function sort(nodes) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.type === 'folder') sort(n.children)
    return nodes
  }

  return sort(root)
}

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
  const [expanded, setExpanded] = useState(new Set())
  const inputRef = useRef(null)

  useEffect(() => {
    if (showNewInput) inputRef.current?.focus()
  }, [showNewInput])

  function toggleFolder(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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

  function renderTree(nodes, depth = 0) {
    return nodes.map(node => {
      const indent = 8 + depth * 14

      if (node.type === 'folder') {
        const isOpen = expanded.has(node.key)
        return (
          <div key={node.key}>
            <div
              className="folder-item"
              style={{ paddingLeft: `${indent}px` }}
              onClick={() => toggleFolder(node.key)}
            >
              <span className="folder-arrow">{isOpen ? '▾' : '▸'}</span>
              <span className="folder-icon">📁</span>
              <span className="folder-label">{node.name}</span>
            </div>
            {isOpen && renderTree(node.children, depth + 1)}
          </div>
        )
      }

      return (
        <div
          key={node.path}
          className={`file-item ${activeFile?.path === node.path ? 'active' : ''}`}
          style={{ paddingLeft: `${indent}px` }}
          onClick={() => onFileSelect(node)}
        >
          <span className="file-label">{node.name.replace(/\.md$/, '')}</span>
          <button
            className="file-del"
            onClick={e => handleDeleteClick(e, node)}
            title="Delete"
          >
            ×
          </button>
        </div>
      )
    })
  }

  const tree = buildTree(files)

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
        {renderTree(tree)}
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

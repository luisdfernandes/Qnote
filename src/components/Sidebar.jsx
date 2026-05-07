import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const MIN_WIDTH = 160
const MAX_WIDTH = 480
const STORAGE_KEY = 'qnote-sidebar-width'
const COLLAPSED_KEY = 'qnote-sidebar-collapsed'
const DEFAULT_WIDTH = 230

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

function parentFolderKeys(relativePath) {
  const parts = (relativePath || '').split('/')
  const keys = []
  let key = ''
  for (let i = 0; i < parts.length - 1; i++) {
    key = key ? `${key}/${parts[i]}` : parts[i]
    keys.push(key)
  }
  return keys
}

function highlight(text, query) {
  if (!query) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part,
  )
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
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchPending, setSearchPending] = useState(false)
  const searchRef = useRef(null)
  const [expanded, setExpanded] = useState(new Set())
  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10)
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH
  })
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true',
  )
  const inputRef = useRef(null)
  const fileListRef = useRef(null)
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  useEffect(() => {
    if (showNewInput) inputRef.current?.focus()
  }, [showNewInput])

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'f') {
        e.preventDefault()
        openSearch()
      } else if (e.key === 'n') {
        e.preventDefault()
        closeSearch()
        setShowNewInput(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (searchMode) searchRef.current?.focus()
  }, [searchMode])

  useEffect(() => {
    if (!activeFile || searchMode) return
    const el = fileListRef.current?.querySelector('.file-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeFile?.path, searchMode])

  useEffect(() => {
    if (!searchMode || !searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearchPending(true)
    const timer = setTimeout(async () => {
      const results = await window.api.github.search(searchQuery)
      setSearchResults(results)
      setSearchPending(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchMode])

  function openSearch() {
    setSearchMode(true)
    setShowNewInput(false)
  }

  function closeSearch() {
    setSearchMode(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const onMouseMove = useCallback((e) => {
    if (!isResizing.current) return
    const delta = e.clientX - startX.current
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(next)
  }, [])

  const onMouseUp = useCallback(() => {
    if (!isResizing.current) return
    isResizing.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setWidth(prev => {
      localStorage.setItem(STORAGE_KEY, String(prev))
      return prev
    })
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  function startResize(e) {
    if (collapsed) return
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }

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
      const indent = 8 + depth * 18

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
          <span className="file-icon">📄</span>
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

  const sidebarStyle = collapsed
    ? { width: 0, minWidth: 0, overflow: 'hidden' }
    : { width, minWidth: width }

  return (
    <>
      {collapsed && (
        <button className="sidebar-expand-tab" onClick={toggleCollapse} title="Expand sidebar">
          ›
        </button>
      )}
    <aside className="sidebar" style={sidebarStyle}>
      <div className="sidebar-header">
        {searchMode ? (
          <input
            ref={searchRef}
            className="search-input"
            type="text"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && closeSearch()}
          />
        ) : (
          <span className="brand">QNote</span>
        )}
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          {!searchMode && (
            <button className="btn-icon" onClick={openSearch} title="Search">
              ⌕
            </button>
          )}
          {!searchMode && (
            <button
              className="btn-icon"
              onClick={() => setShowNewInput(v => !v)}
              title="New note"
            >
              +
            </button>
          )}
          {searchMode ? (
            <button className="btn-icon" onClick={closeSearch} title="Close search">
              ×
            </button>
          ) : (
            <button className="btn-icon" onClick={toggleCollapse} title="Collapse sidebar">
              ‹
            </button>
          )}
        </div>
      </div>

      {!searchMode && showNewInput && (
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

      <div className="file-list" ref={fileListRef}>
        {searchMode ? (
          searchQuery.trim() === '' ? (
            <div className="hint">Type to search…</div>
          ) : searchPending ? (
            <div className="hint">Searching…</div>
          ) : searchResults.length === 0 ? (
            <div className="hint">No results</div>
          ) : searchResults.map(r => (
            <div
              key={r.path}
              className={`search-result ${activeFile?.path === r.path ? 'active' : ''}`}
              onClick={() => {
                onFileSelect(r)
                const keys = parentFolderKeys(r.relativePath)
                if (keys.length) {
                  setExpanded(prev => {
                    const next = new Set(prev)
                    keys.forEach(k => next.add(k))
                    return next
                  })
                }
                closeSearch()
              }}
            >
              <div className="search-result-title">
                {highlight(r.name.replace(/\.md$/, ''), searchQuery)}
              </div>
              {r.snippet && (
                <div className="search-result-snippet">
                  {highlight(r.snippet, searchQuery)}
                </div>
              )}
            </div>
          ))
        ) : (
          <>
            {loading && files.length === 0 && <div className="hint">Loading…</div>}
            {!loading && files.length === 0 && <div className="hint">No notes yet</div>}
            {renderTree(tree)}
          </>
        )}
      </div>

      <div className="sidebar-resize-handle" onMouseDown={startResize} />

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
    </>
  )
}

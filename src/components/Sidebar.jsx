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

  function ensureFolders(parts) {
    let currentLevel = root
    let key = ''
    for (let i = 0; i < parts.length; i++) {
      key = key ? `${key}/${parts[i]}` : parts[i]
      if (!folderMap[key]) {
        const node = { type: 'folder', name: parts[i], key, children: [] }
        folderMap[key] = node
        currentLevel.push(node)
      }
      currentLevel = folderMap[key].children
    }
    return currentLevel
  }

  for (const file of sorted) {
    const rel = file.relativePath || file.name
    const parts = rel.split('/')
    const isPlaceholder = file.name === '.gitkeep'

    if (isPlaceholder) {
      // Register parent folder structure but don't render the file
      if (parts.length > 1) ensureFolders(parts.slice(0, -1))
      continue
    }

    if (parts.length === 1) {
      root.push({ type: 'file', ...file })
    } else {
      const level = ensureFolders(parts.slice(0, -1))
      level.push({ type: 'file', ...file })
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

function relativeTime(ts) {
  if (!ts) return 'never'
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
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
  onFolderCreate,
  onFileMove,
  onFileRename,
  onFolderRename,
  onRequestDeleteFile,
  onRequestDeleteFolder,
  onSettingsOpen,
  onSync,
  syncing,
  lastSync,
  fileCategories,
}) {
  const [newFileName, setNewFileName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [activeFolder, setActiveFolder] = useState('')
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
  const [dragFile, setDragFile] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // null=root | folderKey
  const [contextMenu, setContextMenu] = useState(null) // { type: 'root'|'folder'|'file', target?, x, y }
  const [activeCategories, setActiveCategories] = useState(() => new Set())
  const [renameTarget, setRenameTarget] = useState(null) // { type: 'file'|'folder', id, value }
  const renameInputRef = useRef(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const inputRef = useRef(null)
  const folderInputRef = useRef(null)
  const fileListRef = useRef(null)
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  useEffect(() => {
    if (showNewInput) inputRef.current?.focus()
  }, [showNewInput])

  useEffect(() => {
    if (showNewFolderInput) folderInputRef.current?.focus()
  }, [showNewFolderInput])

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
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('mousedown', close)
    const onKey = e => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!activeFile) return
    const keys = parentFolderKeys(activeFile.relativePath)
    setActiveFolder(keys.length ? keys[keys.length - 1] : '')
  }, [activeFile?.path])

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
    setActiveFolder(key)
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
    onFileCreate(name, activeFolder)
    setNewFileName('')
    setShowNewInput(false)
  }

  function handleCreateFolder(e) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    onFolderCreate(name, activeFolder)
    if (activeFolder) {
      setExpanded(prev => { const n = new Set(prev); n.add(activeFolder); return n })
    }
    setNewFolderName('')
    setShowNewFolderInput(false)
  }

  function openContextMenu(e, type, target) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ type, target, x: e.clientX, y: e.clientY })
  }

  function startRenameFile(file) {
    setRenameTarget({ type: 'file', id: file.path, value: file.name.replace(/\.md$/, ''), original: file })
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function startRenameFolder(node) {
    setRenameTarget({ type: 'folder', id: node.key, value: node.name, original: node })
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (!renameTarget) return
    const { type, original, value } = renameTarget
    setRenameTarget(null)
    if (!value.trim()) return
    if (type === 'file') {
      if (value.trim() === original.name.replace(/\.md$/, '')) return
      onFileRename(original, value)
    } else {
      if (value.trim() === original.name) return
      onFolderRename(original.key, value)
    }
  }

  function cancelRename() {
    setRenameTarget(null)
  }

  function handleDragStart(e, file) {
    setDragFile(file)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDragFile(null)
    setDropTarget(null)
  }

  function handleDrop(e, folderKey) {
    e.preventDefault()
    e.stopPropagation()
    if (!dragFile) return
    setDragFile(null)
    setDropTarget(null)
    const currentFolder = dragFile.relativePath?.includes('/')
      ? dragFile.relativePath.split('/').slice(0, -1).join('/')
      : ''
    if ((folderKey ?? '') === currentFolder) return
    onFileMove(dragFile, folderKey ?? '')
  }

  function renderTree(nodes, depth = 0) {
    return nodes.map(node => {
      const indent = 8 + depth * 26

      if (node.type === 'folder') {
        const isOpen = expanded.has(node.key)
        const isDropOver = dragFile && dropTarget === node.key
        return (
          <div
            key={node.key}
            className={isDropOver ? 'drop-target' : ''}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragFile) setDropTarget(node.key) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(t => t === node.key ? null : t) }}
            onDrop={e => handleDrop(e, node.key)}
          >
            <div
              className="folder-item"
              style={{ paddingLeft: `${indent}px` }}
              onClick={() => toggleFolder(node.key)}
              onContextMenu={e => openContextMenu(e, 'folder', { key: node.key, name: node.name })}
            >
              <span className="folder-arrow">{isOpen ? '▾' : '▸'}</span>
              <span className="folder-icon">
                {isOpen ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/>
                    <path d="M3 9h17l-2.5 9a2 2 0 0 1-2 1.5H5a2 2 0 0 1-2-2V9z"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
                  </svg>
                )}
              </span>
              {renameTarget?.type === 'folder' && renameTarget.id === node.key ? (
                <input
                  ref={renameInputRef}
                  className="rename-input"
                  value={renameTarget.value}
                  onChange={e => setRenameTarget(t => ({ ...t, value: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    else if (e.key === 'Escape') cancelRename()
                  }}
                  onBlur={commitRename}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="folder-label">{node.name}</span>
              )}
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
          draggable
          onDragStart={e => handleDragStart(e, node)}
          onDragEnd={handleDragEnd}
          onClick={() => onFileSelect(node)}
          onContextMenu={e => openContextMenu(e, 'file', node)}
        >
          <span className="file-icon">📄</span>
          {renameTarget?.type === 'file' && renameTarget.id === node.path ? (
            <input
              ref={renameInputRef}
              className="rename-input"
              value={renameTarget.value}
              onChange={e => setRenameTarget(t => ({ ...t, value: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                else if (e.key === 'Escape') cancelRename()
              }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="file-label">{node.name.replace(/\.md$/, '')}</span>
          )}
        </div>
      )
    })
  }

  const allCategories = useMemo(() => {
    const set = new Set()
    for (const cats of Object.values(fileCategories || {})) {
      for (const c of cats) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [fileCategories])

  const filteredFiles = useMemo(() => {
    if (activeCategories.size === 0) return files
    return files.filter(f => {
      if (f.name === '.gitkeep') return true // keep folder structure visible
      const cats = fileCategories?.[f.path] || []
      return cats.some(c => activeCategories.has(c))
    })
  }, [files, fileCategories, activeCategories])

  const tree = buildTree(filteredFiles)

  function toggleCategory(cat) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

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
            placeholder={activeFolder ? `${activeFolder}/filename.md` : 'filename.md'}
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

      {!searchMode && showNewFolderInput && (
        <form className="new-file-form" onSubmit={handleCreateFolder}>
          <input
            ref={folderInputRef}
            type="text"
            placeholder={activeFolder ? `New folder in ${activeFolder}` : 'New folder name'}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowNewFolderInput(false)
                setNewFolderName('')
              }
            }}
          />
        </form>
      )}

      {!searchMode && allCategories.length > 0 && (
        <div className="category-filter">
          {allCategories.map(c => (
            <button
              key={c}
              type="button"
              className={`filter-chip${activeCategories.has(c) ? ' is-active' : ''}`}
              onClick={() => toggleCategory(c)}
            >{c}</button>
          ))}
          {activeCategories.size > 0 && (
            <button
              type="button"
              className="filter-chip filter-chip-clear"
              onClick={() => setActiveCategories(new Set())}
              title="Clear filters"
            >× clear</button>
          )}
        </div>
      )}

      <div
        className={`file-list${dragFile && dropTarget === null ? ' drop-target-root' : ''}`}
        ref={fileListRef}
        onDragOver={e => { e.preventDefault(); if (dragFile) setDropTarget(null) }}
        onDrop={e => handleDrop(e, null)}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(t => t) }}
        onContextMenu={e => {
          if (e.target.closest('.file-item') || e.target.closest('.folder-item')) return
          openContextMenu(e, 'root')
        }}
      >
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
        <button
          className="sidebar-sync"
          onClick={onSync}
          disabled={syncing}
          title={lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString()} — click to sync now` : 'Sync now'}
        >
          <span className={`sync-icon${syncing ? ' is-spinning' : ''}`}>↺</span>
          <span className="sync-label">{lastSync ? relativeTime(lastSync) : 'sync'}</span>
        </button>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.type === 'root' && (
            <>
              <button className="context-menu-item" onClick={() => {
                setActiveFolder('')
                setShowNewInput(true)
                setShowNewFolderInput(false)
                setContextMenu(null)
              }}>New file</button>
              <button className="context-menu-item" onClick={() => {
                setActiveFolder('')
                setShowNewFolderInput(true)
                setShowNewInput(false)
                setContextMenu(null)
              }}>New folder</button>
            </>
          )}

          {contextMenu.type === 'folder' && (
            <>
              <button className="context-menu-item" onClick={() => {
                setActiveFolder(contextMenu.target.key)
                setExpanded(prev => { const n = new Set(prev); n.add(contextMenu.target.key); return n })
                setShowNewInput(true)
                setShowNewFolderInput(false)
                setContextMenu(null)
              }}>New file in "{contextMenu.target.name}"</button>
              <button className="context-menu-item" onClick={() => {
                setActiveFolder(contextMenu.target.key)
                setExpanded(prev => { const n = new Set(prev); n.add(contextMenu.target.key); return n })
                setShowNewFolderInput(true)
                setShowNewInput(false)
                setContextMenu(null)
              }}>New folder in "{contextMenu.target.name}"</button>
              <div className="context-menu-sep" />
              <button className="context-menu-item" onClick={() => {
                startRenameFolder(contextMenu.target)
                setContextMenu(null)
              }}>Rename folder</button>
              <button className="context-menu-item context-menu-danger" onClick={() => {
                onRequestDeleteFolder(contextMenu.target.key, contextMenu.target.name)
                setContextMenu(null)
              }}>Delete folder</button>
            </>
          )}

          {contextMenu.type === 'file' && (
            <>
              <button className="context-menu-item" onClick={() => {
                startRenameFile(contextMenu.target)
                setContextMenu(null)
              }}>Rename</button>
              <div className="context-menu-sep" />
              <button className="context-menu-item context-menu-danger" onClick={() => {
                onRequestDeleteFile(contextMenu.target)
                setContextMenu(null)
              }}>Delete "{contextMenu.target.name.replace(/\.md$/, '')}"</button>
            </>
          )}
        </div>
      )}

    </aside>
    </>
  )
}

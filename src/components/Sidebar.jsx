import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import UploadModal from './UploadModal'

const MIN_WIDTH = 160
const MAX_WIDTH = 480
const STORAGE_KEY = 'qnote-sidebar-width'
const COLLAPSED_KEY = 'qnote-sidebar-collapsed'
const SECTIONS_COLLAPSED_KEY = 'qnote-sections-collapsed'
const DEFAULT_WIDTH = 240

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
    if (file.name === '.gitkeep') {
      if (parts.length > 1) ensureFolders(parts.slice(0, -1))
      continue
    }
    if (parts.length === 1) root.push({ type: 'file', ...file })
    else {
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

// ── Per-source section ──────────────────────────────────────────────────────
function SourceSection({
  source,
  files,
  categoriesByPath,
  isOpen,
  onToggleOpen,
  activeFile,
  onFileSelect,
  onFileMove,
  onUploadBinary,
  onOpenUpload,
  startNewFile,
  startNewFolder,
  startRenameFile,
  startRenameFolder,
  onRequestDeleteFile,
  onRequestDeleteFolder,
  newFileMode,        // null | { folder: '' }
  newFolderMode,      // null | { folder: '' }
  setNewFileMode,
  setNewFolderMode,
  renameTarget,
  setRenameTarget,
  renameInputRef,
  commitRename,
  cancelRename,
  expandedFolders,
  setExpandedFolders,
  activeCategories,
  toggleCategory,
  clearCategories,
}) {
  const [newFileName, setNewFileName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [dragFile, setDragFile] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)

  useEffect(() => { if (newFileMode) inputRef.current?.focus() }, [newFileMode])
  useEffect(() => { if (newFolderMode) folderInputRef.current?.focus() }, [newFolderMode])

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

  const isNotes = source.kind === 'notes'

  const allCategories = useMemo(() => {
    if (!isNotes) return []
    const set = new Set()
    for (const cats of Object.values(categoriesByPath || {})) for (const c of cats) set.add(c)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [categoriesByPath, isNotes])

  const filteredFiles = useMemo(() => {
    if (!isNotes || activeCategories.size === 0) return files
    return files.filter(f => {
      if (f.name === '.gitkeep') return true
      const cats = categoriesByPath?.[f.path] || []
      return cats.some(c => activeCategories.has(c))
    })
  }, [files, categoriesByPath, activeCategories, isNotes])

  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles])

  function openContextMenu(e, type, target) {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ type, target, x: e.clientX, y: e.clientY })
  }

  function handleCreate(e) {
    e.preventDefault()
    const name = newFileName.trim()
    if (!name) return
    const finalName = newFileMode?.diagram && !name.endsWith('.excalidraw') ? `${name}.excalidraw` : name
    startNewFile(finalName, newFileMode?.folder || '')
    setNewFileName('')
    setNewFileMode(null)
  }

  function handleCreateFolder(e) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    startNewFolder(name, newFolderMode?.folder || '')
    if (newFolderMode?.folder) {
      setExpandedFolders(prev => { const n = new Set(prev); n.add(newFolderMode.folder); return n })
    }
    setNewFolderName('')
    setNewFolderMode(null)
  }

  function handleDragStart(e, file) {
    setDragFile(file)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragEnd() { setDragFile(null); setDropTarget(null) }

  function isExternalFileDrag(e) {
    return Array.from(e.dataTransfer?.types || []).includes('Files')
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadDroppedFiles(fileList, subFolder = '') {
    if (!isNotes && fileList?.length) {
      for (const f of fileList) {
        try {
          const base64 = await readFileAsBase64(f)
          await onUploadBinary(source.id, f.name, base64, subFolder)
        } catch (err) {
          console.error('Upload failed for', f.name, err)
        }
      }
    } else if (isNotes && fileList?.length) {
      // Only allow .md drops into notes-kind sections
      for (const f of fileList) {
        if (!f.name.toLowerCase().endsWith('.md')) continue
        try {
          const base64 = await readFileAsBase64(f)
          await onUploadBinary(source.id, f.name, base64, subFolder)
        } catch (err) {
          console.error('Upload failed for', f.name, err)
        }
      }
    }
  }

  function handleDrop(e, folderKey) {
    e.preventDefault(); e.stopPropagation()
    setDropTarget(null)
    // External OS drop → upload files
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length > 0) {
      uploadDroppedFiles(files, folderKey ?? '')
      return
    }
    // Internal drag → move
    if (!dragFile) return
    setDragFile(null)
    const currentFolder = dragFile.relativePath?.includes('/')
      ? dragFile.relativePath.split('/').slice(0, -1).join('/')
      : ''
    if ((folderKey ?? '') === currentFolder) return
    onFileMove(dragFile, source.id, folderKey ?? '')
  }

  function toggleFolder(key) {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function onUploadClick(folder = '') {
    onOpenUpload?.(folder)
  }

  function renderTree(nodes, depth = 0) {
    return nodes.map(node => {
      const indent = 8 + depth * 22
      if (node.type === 'folder') {
        const open = expandedFolders.has(node.key)
        const isDropOver = dragFile && dropTarget === node.key
        return (
          <div
            key={node.key}
            className={isDropOver ? 'drop-target' : ''}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragFile || isExternalFileDrag(e)) setDropTarget(node.key) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(t => t === node.key ? null : t) }}
            onDrop={e => handleDrop(e, node.key)}
          >
            <div
              className="folder-item"
              style={{ paddingLeft: `${indent}px` }}
              onDoubleClick={() => toggleFolder(node.key)}
              onContextMenu={e => openContextMenu(e, 'folder', { key: node.key, name: node.name })}
            >
              <span
                className="folder-arrow"
                onClick={e => { e.stopPropagation(); toggleFolder(node.key) }}
              >{open ? '▾' : '▸'}</span>
              <span className="folder-icon">
                {open ? (
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
              {renameTarget?.type === 'folder' && renameTarget.id === node.key && renameTarget.sourceId === source.id ? (
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
            {open && renderTree(node.children, depth + 1)}
          </div>
        )
      }
      const labelText = isNotes ? node.name.replace(/\.(md|excalidraw)$/, '') : node.name
      return (
        <div
          key={node.path}
          className={`file-item ${activeFile?.path === node.path ? 'active' : ''}`}
          style={{ paddingLeft: `${indent}px` }}
          draggable
          onDragStart={e => handleDragStart(e, node)}
          onDragEnd={handleDragEnd}
          onClick={() => onFileSelect(node, source.id)}
          onContextMenu={e => openContextMenu(e, 'file', node)}
        >
          <span className="file-icon">{isNotes && !node.name.endsWith('.excalidraw') ? '📄' : fileIconFor(node.name)}</span>
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
            <span className="file-label">{labelText}</span>
          )}
        </div>
      )
    })
  }

  return (
    <div className="source-section">
      <div
        className="source-section-header"
        onClick={() => onToggleOpen(source.id)}
        onContextMenu={e => openContextMenu(e, 'root')}
      >
        <span className="source-section-arrow">{isOpen ? '▾' : '▸'}</span>
        <span className="source-section-name">{source.name}</span>
        <span className="source-section-kind">{source.kind === 'files' ? 'files' : 'notes'}</span>
        <span style={{ flex: 1 }} />
        {isOpen && (
          <>
            <button
              className="btn-icon"
              title={`Upload to ${source.name}`}
              onClick={e => { e.stopPropagation(); onUploadClick('') }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
            {isNotes ? (
              <div className="add-btn-group" onClick={e => e.stopPropagation()}>
                <button
                  className="btn-icon"
                  title="New note (hover for more)"
                  onClick={e => { e.stopPropagation(); setNewFileMode({ folder: '' }); setNewFolderMode(null) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </button>
                <div className="add-btn-menu">
                  <button className="add-btn-menu-item" onClick={() => { setNewFolderMode({ folder: '' }); setNewFileMode(null) }}>
                    New folder
                  </button>
                  <button className="add-btn-menu-item" onClick={() => { setNewFileMode({ folder: '', diagram: true }); setNewFolderMode(null) }}>
                    New diagram
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  className="btn-icon"
                  title="New folder"
                  onClick={e => { e.stopPropagation(); setNewFolderMode({ folder: '' }); setNewFileMode(null) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    <line x1="12" y1="11" x2="12" y2="17"/>
                    <line x1="9" y1="14" x2="15" y2="14"/>
                  </svg>
                </button>
                <button
                  className="btn-icon"
                  title="New file"
                  onClick={e => { e.stopPropagation(); setNewFileMode({ folder: '' }); setNewFolderMode(null) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </button>
              </>
            )}
          </>
        )}
      </div>

      {isOpen && (
        <>
          {newFileMode && (
            <form className="new-file-form" onSubmit={handleCreate}>
              <input
                ref={inputRef}
                type="text"
                placeholder={newFileMode?.diagram ? 'diagram.excalidraw' : isNotes ? 'filename.md' : 'filename.ext'}
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setNewFileMode(null); setNewFileName('') }
                }}
                onBlur={() => { if (!newFileName.trim()) setNewFileMode(null) }}
              />
            </form>
          )}
          {newFolderMode && (
            <form className="new-file-form" onSubmit={handleCreateFolder}>
              <input
                ref={folderInputRef}
                type="text"
                placeholder="New folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setNewFolderMode(null); setNewFolderName('') }
                }}
                onBlur={() => { if (!newFolderName.trim()) setNewFolderMode(null) }}
              />
            </form>
          )}

          {isNotes && allCategories.length > 0 && (
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
                  onClick={clearCategories}
                  title="Clear filters"
                >× clear</button>
              )}
            </div>
          )}

          <div
            className="source-tree"
            onDragOver={e => {
              if (dragFile || isExternalFileDrag(e)) {
                e.preventDefault()
                if (!e.target.closest('.folder-item') && !e.target.closest('.source-root-row')) setDropTarget(null)
              }
            }}
            onDrop={e => {
              if (e.target.closest('.folder-item') || e.target.closest('.source-root-row')) return
              handleDrop(e, null)
            }}
            onContextMenu={e => {
              if (e.target.closest('.file-item') || e.target.closest('.folder-item')) return
              openContextMenu(e, 'root')
            }}
          >
            <div
              className={`source-root-row${dropTarget === '__root__' ? ' drop-over' : ''}`}
              onDragOver={e => {
                if (dragFile || isExternalFileDrag(e)) { e.preventDefault(); e.stopPropagation(); setDropTarget('__root__') }
              }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(t => t === '__root__' ? null : t) }}
              onDrop={e => { setDropTarget(null); handleDrop(e, null) }}
              title={isNotes ? 'Drop .md files here to upload to root' : 'Drop files here to upload to root'}
            >
              <span className="folder-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
                </svg>
              </span>
              <span className="folder-label">{source.folder || '(repo root)'}</span>
            </div>
            {files.length === 0 && (
              <div className="hint">{source.kind === 'files' ? 'No files yet' : 'No notes yet'}</div>
            )}
            {renderTree(tree)}
          </div>
        </>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.type === 'root' && (
            <>
              <button className="context-menu-item" onClick={() => {
                setNewFileMode({ folder: '' }); setNewFolderMode(null); setContextMenu(null)
              }}>New {source.kind === 'files' ? 'file' : 'note'}</button>
              {isNotes && (
                <button className="context-menu-item" onClick={() => {
                  setNewFileMode({ folder: '', diagram: true }); setNewFolderMode(null); setContextMenu(null)
                }}>New diagram</button>
              )}
              <button className="context-menu-item" onClick={() => {
                setNewFolderMode({ folder: '' }); setNewFileMode(null); setContextMenu(null)
              }}>New folder</button>
              <button className="context-menu-item" onClick={() => {
                onUploadClick(''); setContextMenu(null)
              }}>Upload {isNotes ? 'notes' : 'files'}…</button>
            </>
          )}
          {contextMenu.type === 'folder' && (
            <>
              <button className="context-menu-item" onClick={() => {
                setNewFileMode({ folder: contextMenu.target.key })
                setNewFolderMode(null)
                setExpandedFolders(prev => { const n = new Set(prev); n.add(contextMenu.target.key); return n })
                setContextMenu(null)
              }}>New {source.kind === 'files' ? 'file' : 'note'} in "{contextMenu.target.name}"</button>
              {isNotes && (
                <button className="context-menu-item" onClick={() => {
                  setNewFileMode({ folder: contextMenu.target.key, diagram: true })
                  setNewFolderMode(null)
                  setExpandedFolders(prev => { const n = new Set(prev); n.add(contextMenu.target.key); return n })
                  setContextMenu(null)
                }}>New diagram in "{contextMenu.target.name}"</button>
              )}
              <button className="context-menu-item" onClick={() => {
                setNewFolderMode({ folder: contextMenu.target.key })
                setNewFileMode(null)
                setExpandedFolders(prev => { const n = new Set(prev); n.add(contextMenu.target.key); return n })
                setContextMenu(null)
              }}>New folder in "{contextMenu.target.name}"</button>
              <button className="context-menu-item" onClick={() => {
                onUploadClick(contextMenu.target.key); setContextMenu(null)
              }}>Upload {isNotes ? 'notes' : 'files'} into "{contextMenu.target.name}"…</button>
              <div className="context-menu-sep" />
              <button className="context-menu-item" onClick={() => {
                startRenameFolder(source.id, { key: contextMenu.target.key, name: contextMenu.target.name })
                setContextMenu(null)
              }}>Rename folder</button>
              <button className="context-menu-item context-menu-danger" onClick={() => {
                onRequestDeleteFolder(source.id, contextMenu.target.key, contextMenu.target.name)
                setContextMenu(null)
              }}>Delete folder</button>
            </>
          )}
          {contextMenu.type === 'file' && (
            <>
              <button className="context-menu-item" onClick={() => {
                startRenameFile(source.id, contextMenu.target)
                setContextMenu(null)
              }}>Rename</button>
              <div className="context-menu-sep" />
              <button className="context-menu-item context-menu-danger" onClick={() => {
                onRequestDeleteFile(contextMenu.target, source.id)
                setContextMenu(null)
              }}>Delete "{isNotes ? contextMenu.target.name.replace(/\.md$/, '') : contextMenu.target.name}"</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function fileIconFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'excalidraw') return '✏'
  if (['png','jpg','jpeg','gif','svg','webp','bmp','ico'].includes(ext)) return '🖼'
  if (['mp4','mov','webm','avi','mkv'].includes(ext)) return '🎬'
  if (['mp3','wav','ogg','m4a','flac'].includes(ext)) return '♪'
  if (['pdf'].includes(ext)) return '📕'
  if (['zip','tar','gz','7z','rar'].includes(ext)) return '🗜'
  if (['doc','docx'].includes(ext)) return '📘'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['ppt','pptx'].includes(ext)) return '📙'
  return '📄'
}

// ── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({
  sources,
  filesBySource,
  categoriesBySource,
  activeFile,
  loading,
  onFileSelect,
  onFileCreate,
  onFolderCreate,
  onFileMove,
  onFileRename,
  onFolderRename,
  onUploadBinary,
  onRequestDeleteFile,
  onRequestDeleteFolder,
  onSettingsOpen,
  onSync,
  syncing,
  lastSync,
}) {
  const [width, setWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10)
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH
  })
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')
  const [uploadCtx, setUploadCtx] = useState(null) // { source, folder }

  function openUpload(source, folder = '') {
    setUploadCtx({ source, folder })
  }

  const [openSections, setOpenSections] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SECTIONS_COLLAPSED_KEY) || 'null')
      if (stored && typeof stored === 'object') return new Set(stored.open || [])
    } catch {}
    return new Set(sources.map(s => s.id))
  })

  // Make sure newly-added sources start expanded
  useEffect(() => {
    setOpenSections(prev => {
      const next = new Set(prev)
      let changed = false
      for (const s of sources) {
        if (!prev.has(s.id) && !localStorage.getItem(SECTIONS_COLLAPSED_KEY + ':' + s.id + ':seen')) {
          next.add(s.id)
          localStorage.setItem(SECTIONS_COLLAPSED_KEY + ':' + s.id + ':seen', '1')
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [sources])

  function toggleSection(id) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try { localStorage.setItem(SECTIONS_COLLAPSED_KEY, JSON.stringify({ open: [...next] })) } catch {}
      return next
    })
  }

  // ── Per-section UI state ───────────────────────────────────────────────────
  const [perSection, setPerSection] = useState({}) // { [sourceId]: { newFileMode, newFolderMode, expandedFolders, activeCategories } }

  const DEFAULT_SEC = { newFileMode: null, newFolderMode: null, expandedFolders: new Set(), activeCategories: new Set() }
  function getSec(id) {
    return perSection[id] || DEFAULT_SEC
  }
  function setSec(id, patch) {
    setPerSection(prev => ({ ...prev, [id]: { ...(prev[id] || DEFAULT_SEC), ...patch } }))
  }

  // ── Rename target (cross-section) ──────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState(null) // { type, id, sourceId, value, original }
  const renameInputRef = useRef(null)

  function startRenameFile(sourceId, file) {
    const src = sources.find(s => s.id === sourceId)
    const isNotes = src?.kind === 'notes'
    const value = isNotes ? file.name.replace(/\.md$/, '') : file.name
    setRenameTarget({ type: 'file', id: file.path, sourceId, value, original: file })
    setTimeout(() => renameInputRef.current?.select(), 0)
  }
  function startRenameFolder(sourceId, node) {
    setRenameTarget({ type: 'folder', id: node.key, sourceId, value: node.name, original: node })
    setTimeout(() => renameInputRef.current?.select(), 0)
  }
  function commitRename() {
    if (!renameTarget) return
    const { type, sourceId, original, value } = renameTarget
    setRenameTarget(null)
    if (!value.trim()) return
    if (type === 'file') {
      const src = sources.find(s => s.id === sourceId)
      const baseName = src?.kind === 'notes' ? original.name.replace(/\.md$/, '') : original.name
      if (value.trim() === baseName) return
      onFileRename(original, sourceId, value)
    } else {
      if (value.trim() === original.name) return
      onFolderRename(sourceId, original.key, value)
    }
  }
  function cancelRename() { setRenameTarget(null) }

  // ── Resize ─────────────────────────────────────────────────────────────────
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

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
    setWidth(prev => { localStorage.setItem(STORAGE_KEY, String(prev)); return prev })
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

  // Tick state for relative time refresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // Auto-expand parent folders when active file changes
  useEffect(() => {
    if (!activeFile?.sourceId) return
    const keys = parentFolderKeys(activeFile.relativePath)
    if (!keys.length) return
    setSec(activeFile.sourceId, {
      expandedFolders: new Set([...(getSec(activeFile.sourceId).expandedFolders), ...keys]),
    })
    // also expand the section
    setOpenSections(prev => prev.has(activeFile.sourceId) ? prev : new Set([...prev, activeFile.sourceId]))
  }, [activeFile?.path])

  const sidebarStyle = collapsed
    ? { width: 0, minWidth: 0, overflow: 'hidden' }
    : { width, minWidth: width }

  return (
    <>
      {collapsed && (
        <button className="sidebar-expand-tab" onClick={toggleCollapse} title="Expand sidebar">›</button>
      )}
      <aside className="sidebar" style={sidebarStyle}>
        <div className="sidebar-header">
          <span className="brand">QNote</span>
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            <button className="btn-icon" onClick={toggleCollapse} title="Collapse sidebar">‹</button>
          </div>
        </div>

        <div className="sidebar-scroll">
          <>
            {loading && Object.keys(filesBySource).length === 0 && <div className="hint">Loading…</div>}
              {sources.map(src => {
                const sec = getSec(src.id)
                return (
                  <SourceSection
                    key={src.id}
                    source={src}
                    files={filesBySource[src.id] || []}
                    categoriesByPath={categoriesBySource[src.id] || {}}
                    isOpen={openSections.has(src.id)}
                    onToggleOpen={toggleSection}
                    activeFile={activeFile}
                    onFileSelect={onFileSelect}
                    onFileMove={onFileMove}
                    onUploadBinary={onUploadBinary}
                    onOpenUpload={(folder) => openUpload(src, folder)}
                    startNewFile={(name, sub) => onFileCreate(name, src.id, sub)}
                    startNewFolder={(name, parent) => onFolderCreate(name, src.id, parent)}
                    startRenameFile={startRenameFile}
                    startRenameFolder={startRenameFolder}
                    onRequestDeleteFile={onRequestDeleteFile}
                    onRequestDeleteFolder={onRequestDeleteFolder}
                    newFileMode={sec.newFileMode}
                    newFolderMode={sec.newFolderMode}
                    setNewFileMode={mode => setSec(src.id, { newFileMode: mode })}
                    setNewFolderMode={mode => setSec(src.id, { newFolderMode: mode })}
                    renameTarget={renameTarget}
                    setRenameTarget={setRenameTarget}
                    renameInputRef={renameInputRef}
                    commitRename={commitRename}
                    cancelRename={cancelRename}
                    expandedFolders={sec.expandedFolders}
                    setExpandedFolders={fn => {
                      setPerSection(prev => {
                        const cur = (prev[src.id] || DEFAULT_SEC).expandedFolders
                        const next = typeof fn === 'function' ? fn(cur) : fn
                        return { ...prev, [src.id]: { ...(prev[src.id] || DEFAULT_SEC), expandedFolders: next } }
                      })
                    }}
                    activeCategories={sec.activeCategories}
                    toggleCategory={cat => {
                      setPerSection(prev => {
                        const sec = prev[src.id] || DEFAULT_SEC
                        const cur = new Set(sec.activeCategories)
                        if (cur.has(cat)) cur.delete(cat); else cur.add(cat)
                        return { ...prev, [src.id]: { ...sec, activeCategories: cur } }
                      })
                    }}
                    clearCategories={() => setSec(src.id, { activeCategories: new Set() })}
                  />
                )
              })}
          </>
        </div>

        <div className="sidebar-resize-handle" onMouseDown={startResize} />

        <div className="sidebar-footer">
          <button className="btn-icon" onClick={onSettingsOpen} title="Settings">⚙</button>
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
      </aside>

      {uploadCtx && (
        <UploadModal
          sourceName={uploadCtx.source.name}
          sourceKind={uploadCtx.source.kind}
          targetFolder={uploadCtx.folder}
          onClose={() => setUploadCtx(null)}
          onUpload={(name, base64, sub) => onUploadBinary(uploadCtx.source.id, name, base64, sub)}
        />
      )}
    </>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Editor from './components/Editor'
import FilesViewer from './components/FilesViewer'
import Settings from './components/Settings'

// Strip diacritics so accented chars (ã, é, ç …) don't produce malformed paths/URLs
function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── Front matter helpers (notes only) ────────────────────────────────────────
function parseFrontMatter(md) {
  if (!md) return { meta: {}, body: '' }
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { meta: {}, body: md }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    } else {
      v = v.replace(/^["']|["']$/g, '')
    }
    meta[m[1]] = v
  }
  return { meta, body: md.slice(match[0].length) }
}

function serializeFrontMatter(meta, body) {
  const keys = Object.keys(meta).filter(k => {
    const v = meta[k]
    if (Array.isArray(v)) return v.length > 0
    return v !== undefined && v !== null && v !== ''
  })
  if (keys.length === 0) return body
  const lines = keys.map(k => {
    const v = meta[k]
    if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`
    return `${k}: ${v}`
  })
  const trimmedBody = body.replace(/^\s+/, '')
  return `---\n${lines.join('\n')}\n---\n\n${trimmedBody}`
}

function noteDir(notePath) {
  const i = notePath.lastIndexOf('/')
  return i >= 0 ? notePath.slice(0, i) : ''
}

function relativeFromDir(fromDir, toPath) {
  const fromParts = fromDir ? fromDir.split('/') : []
  const toParts = toPath.split('/')
  let i = 0
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++
  const ups = fromParts.length - i
  const rest = toParts.slice(i)
  return [...Array(ups).fill('..'), ...rest].join('/')
}

function resolveFromDir(fromDir, relPath) {
  const stack = fromDir ? fromDir.split('/') : []
  for (const p of relPath.split('/')) {
    if (p === '..') stack.pop()
    else if (p && p !== '.') stack.push(p)
  }
  return stack.join('/')
}

function rawUrlBase(cfg) {
  if (!cfg?.owner || !cfg?.repo) return null
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch || 'main'}/`
}

const IMG_RE = /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g

function safeDecode(s) { try { return decodeURI(s) } catch { return s } }
function encodeRelPath(p) {
  return p.split('/').map(s => (s === '..' || s === '.') ? s : encodeURIComponent(s)).join('/')
}

function toEditorMarkdown(md, notePath, cfg) {
  const base = rawUrlBase(cfg)
  if (!md || !notePath || !base) return md
  const dir = noteDir(notePath)
  return md.replace(IMG_RE, (m, pre, src, title, post) => {
    if (/^[a-z]+:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/')) return m
    const decoded = safeDecode(src)
    const full = resolveFromDir(dir, decoded)
    const encoded = full.split('/').map(encodeURIComponent).join('/')
    return `${pre}${base}${encoded}${title || ''}${post}`
  })
}

function toStorageMarkdown(md, notePath, cfg) {
  const base = rawUrlBase(cfg)
  if (!md || !notePath || !base) return md
  const dir = noteDir(notePath)
  return md.replace(IMG_RE, (m, pre, src, title, post) => {
    if (!src.startsWith(base)) return m
    const fullEncoded = src.slice(base.length)
    const fullDecoded = safeDecode(fullEncoded)
    const rel = relativeFromDir(dir, fullDecoded)
    return `${pre}${encodeRelPath(rel)}${title || ''}${post}`
  })
}

const FONT_STACKS = {
  system:  "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  serif:   "Georgia, 'Times New Roman', serif",
  mono:    "'Cascadia Code', Consolas, 'Courier New', monospace",
  calibri: "Calibri, Candara, 'Segoe UI', sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
}

const ACCENT_COLORS = {
  mint:   { color: '#4ec9b0', dim: '#3aab96' },
  cyan:   { color: '#00d4d4', dim: '#00a8a8' },
  blue:   { color: '#4a9eff', dim: '#2d80e0' },
  purple: { color: '#b07cff', dim: '#9560e0' },
  pink:   { color: '#ff5ea8', dim: '#e0408a' },
  orange: { color: '#ff9f43', dim: '#e0832c' },
  gold:   { color: '#f1c40f', dim: '#d4ac0d' },
  lime:   { color: '#a3e048', dim: '#88c038' },
}

function applyPreferences(cfg) {
  const theme  = cfg?.theme  || 'dark'
  const font   = cfg?.font   || 'system'
  const accent = ACCENT_COLORS[cfg?.accent] || ACCENT_COLORS.mint
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.setProperty('--font-content', FONT_STACKS[font] ?? FONT_STACKS.system)
  document.documentElement.style.setProperty('--accent', accent.color)
  document.documentElement.style.setProperty('--accent-dim', accent.dim)
}

// ── Sources helpers ──────────────────────────────────────────────────────────
function migrateSources(cfg) {
  if (Array.isArray(cfg?.sources) && cfg.sources.length > 0) return cfg.sources
  // Migrate legacy single-folder config
  return [{
    id: 'notes',
    name: 'Notes',
    folder: cfg?.folder ?? 'notes',
    kind: 'notes',
  }]
}

function genSourceId() {
  return 'src_' + Math.random().toString(36).slice(2, 9)
}

export default function App() {
  const [config, setConfig] = useState(null)
  const [sources, setSources] = useState([])
  const [filesBySource, setFilesBySource] = useState({}) // { [id]: file[] }
  const [categoriesBySource, setCategoriesBySource] = useState({}) // { [id]: { path: cats } }
  const [activeFile, setActiveFile] = useState(null) // { ...file, sourceId, sourceKind }
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [meta, setMeta] = useState({})
  const [savedMeta, setSavedMeta] = useState({})
  const [mode, setMode] = useState('view')
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('')
  const [offline, setOffline] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { type, ... }
  const [lastSync, setLastSync] = useState(null)

  const isDirty =
    !!activeFile && (content !== savedContent ||
      JSON.stringify(meta) !== JSON.stringify(savedMeta))

  const activeSource = useMemo(
    () => sources.find(s => s.id === activeFile?.sourceId) || null,
    [sources, activeFile?.sourceId],
  )

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    const cfg = await window.api.config.get()
    const migratedSources = migrateSources(cfg)
    const finalCfg = { ...cfg, sources: migratedSources }
    setConfig(finalCfg)
    setSources(migratedSources)
    applyPreferences(finalCfg)
    if (finalCfg.token && finalCfg.owner && finalCfg.repo) {
      loadAllSources(migratedSources)
    } else {
      setShowSettings(true)
    }
  }

  async function loadAllSources(srcList = sources) {
    if (!srcList.length) return
    setLoading(true)
    setError(null)
    let anyFromCache = false
    let anyFresh = false
    try {
      const results = await Promise.all(srcList.map(async (src) => {
        try {
          const includeAll = src.kind === 'files'
          const { files, fromCache } = await window.api.github.listFiles({ folder: src.folder, includeAll })
          if (fromCache) anyFromCache = true
          else anyFresh = true
          return [src.id, files]
        } catch (e) {
          console.error('listFiles failed for source', src.id, e)
          return [src.id, []]
        }
      }))
      const next = {}
      for (const [id, files] of results) next[id] = files
      setFilesBySource(next) // replaces fully — drops removed sources
      setCategoriesBySource(prev => {
        const out = {}
        for (const s of srcList) out[s.id] = prev[s.id] || {}
        return out
      })
      setOffline(anyFromCache && !anyFresh)
      if (anyFresh) setLastSync(Date.now())

      // Background load metadata for notes sources
      for (const src of srcList) {
        if (src.kind !== 'notes') continue
        window.api.github.loadAllMetadata(src.folder)
          .then(map => setCategoriesBySource(prev => ({ ...prev, [src.id]: map })))
          .catch(() => {})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const openFile = useCallback(async (file, sourceId) => {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    setLoading(true)
    setError(null)
    try {
      if (src.kind === 'notes') {
        const { content: text, sha, fromCache } = await window.api.github.getFile(file.path)
        const { meta: parsedMeta, body } = parseFrontMatter(text)
        setActiveFile({ ...file, sha, sourceId, sourceKind: 'notes' })
        setContent(body); setSavedContent(body)
        setMeta(parsedMeta); setSavedMeta(parsedMeta)
        if (fromCache) setOffline(true)
        setMode('view')
      } else {
        // files-kind: fetch lazily inside FilesViewer (it knows the type)
        setActiveFile({ ...file, sourceId, sourceKind: 'files' })
        setContent(''); setSavedContent('')
        setMeta({}); setSavedMeta({})
        setMode('view')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sources])

  const saveFile = useCallback(async () => {
    if (!activeFile || !isDirty) return
    if (activeFile.sourceKind !== 'notes') return // FilesViewer handles its own saves
    setLoading(true)
    setStatus('Saving…')
    try {
      const newMeta = {
        ...meta,
        created: meta.created || new Date().toISOString(),
        modified: new Date().toISOString(),
      }
      const fullContent = serializeFrontMatter(newMeta, content)
      const { sha } = await window.api.github.saveFile({
        filePath: activeFile.path,
        content: fullContent,
        sha: activeFile.sha,
      })
      setActiveFile(prev => ({ ...prev, sha }))
      setSavedContent(content)
      setMeta(newMeta); setSavedMeta(newMeta)
      const sid = activeFile.sourceId
      setFilesBySource(prev => ({
        ...prev,
        [sid]: (prev[sid] || []).map(f => f.path === activeFile.path ? { ...f, sha } : f),
      }))
      setCategoriesBySource(prev => {
        const cats = Array.isArray(newMeta.categories) ? newMeta.categories : []
        const map = { ...(prev[sid] || {}) }
        if (cats.length) map[activeFile.path] = cats
        else delete map[activeFile.path]
        return { ...prev, [sid]: map }
      })
      setStatus('Saved ✓')
      setTimeout(() => setStatus(''), 2500)
      setMode('view')
    } catch (e) {
      setError(e.message); setStatus('')
    } finally {
      setLoading(false)
    }
  }, [activeFile, content, isDirty, meta])

  // Called by FilesViewer after a successful binary/text save
  function onFilesSaved(file, newSha) {
    setActiveFile(prev => prev ? { ...prev, sha: newSha } : prev)
    setFilesBySource(prev => ({
      ...prev,
      [file.sourceId]: (prev[file.sourceId] || []).map(f =>
        f.path === file.path ? { ...f, sha: newSha } : f),
    }))
  }

  async function createFile(name, sourceId, subFolder = '') {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    const isNotes = src.kind === 'notes'
    const safeName = stripDiacritics(name)
    const fileName = isNotes && !safeName.endsWith('.md') ? `${safeName}.md` : safeName
    const folderPath = (src.folder || '').replace(/\/$/, '')
    const sub = (subFolder || '').replace(/\/$/, '')
    const base = [folderPath, sub].filter(Boolean).join('/')
    const filePath = base ? `${base}/${fileName}` : fileName
    const relativePath = sub ? `${sub}/${fileName}` : fileName

    setLoading(true); setError(null)
    try {
      let initialContent = ''
      if (isNotes) {
        const now = new Date().toISOString()
        const initialMeta = { categories: [], created: now, modified: now }
        const title = fileName.replace(/\.md$/, '')
        initialContent = serializeFrontMatter(initialMeta, `# ${title}\n\n`)
      }
      const { sha } = await window.api.github.saveFile({
        filePath, content: initialContent, sha: null,
      })
      const newFile = { name: fileName, path: filePath, sha, relativePath }
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: [...(prev[sourceId] || []), newFile]
          .sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name)),
      }))
      await openFile(newFile, sourceId)
      if (isNotes) setMode('edit')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Upload arbitrary binary into a files-kind source. base64 only (no data URL prefix).
  async function uploadBinary(sourceId, name, base64Data, subFolder = '') {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    const folderPath = (src.folder || '').replace(/\/$/, '')
    const sub = (subFolder || '').replace(/\/$/, '')
    const base = [folderPath, sub].filter(Boolean).join('/')
    const filePath = base ? `${base}/${name}` : name
    const relativePath = sub ? `${sub}/${name}` : name

    setLoading(true); setError(null)
    try {
      const { sha } = await window.api.github.saveBinary({
        filePath, base64Data, sha: null, message: `add ${name}`,
      })
      const newFile = { name, path: filePath, sha, relativePath }
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: [...(prev[sourceId] || []), newFile]
          .sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name)),
      }))
      return newFile
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }

  // Upload an inline image used inside the markdown editor for the active note
  async function uploadImage(base64Data, filename) {
    const src = activeSource
    if (!src) throw new Error('No active source')
    const folderPath = (src.folder || '').replace(/\/$/, '')
    const imagePath = folderPath ? `${folderPath}/images/${filename}` : `images/${filename}`
    const { url } = await window.api.github.uploadImage({ filePath: imagePath, base64Data })
    return url
  }

  async function moveFile(file, sourceId, targetFolderKey) {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    const folderBase = (src.folder || '').replace(/\/$/, '')
    const newRelPath = targetFolderKey ? `${targetFolderKey}/${file.name}` : file.name
    const newFullPath = folderBase ? `${folderBase}/${newRelPath}` : newRelPath
    if (file.path === newFullPath) return

    setLoading(true); setError(null)
    try {
      const { sha } = await window.api.github.moveFile({ oldPath: file.path, newPath: newFullPath })
      const moved = { ...file, path: newFullPath, relativePath: newRelPath, sha }
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: (prev[sourceId] || []).map(f => f.path === file.path ? moved : f)
          .sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name)),
      }))
      if (activeFile?.path === file.path) setActiveFile(prev => ({ ...prev, ...moved }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function createFolder(name, sourceId, parentFolder = '') {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    const folderBase = (src.folder || '').replace(/\/$/, '')
    const sub = (parentFolder || '').replace(/\/$/, '')
    const cleanName = stripDiacritics(name.trim()).replace(/^\/|\/$/g, '')
    if (!cleanName) return
    const relativePath = sub ? `${sub}/${cleanName}` : cleanName
    const folderPath = folderBase ? `${folderBase}/${relativePath}` : relativePath

    setLoading(true); setError(null)
    try {
      await window.api.github.createFolder({ folderPath })
      await loadAllSources()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function renameFile(file, sourceId, newName) {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    let safe = stripDiacritics(newName.trim()).replace(/[\\/]/g, '-')
    if (!safe) return
    if (src.kind === 'notes' && !safe.endsWith('.md')) safe += '.md'
    const slash = file.path.lastIndexOf('/')
    const dir = slash >= 0 ? file.path.slice(0, slash) : ''
    const newPath = dir ? `${dir}/${safe}` : safe
    if (newPath === file.path) return
    const folderBase = (src.folder || '').replace(/\/$/, '')
    const prefix = folderBase ? `${folderBase}/` : ''
    const newRelPath = newPath.startsWith(prefix) ? newPath.slice(prefix.length) : newPath

    setLoading(true); setError(null)
    try {
      const { sha } = await window.api.github.moveFile({ oldPath: file.path, newPath })
      const renamed = { ...file, path: newPath, name: safe, relativePath: newRelPath, sha }
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: (prev[sourceId] || []).map(f => f.path === file.path ? renamed : f)
          .sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name)),
      }))
      if (activeFile?.path === file.path) setActiveFile(prev => ({ ...prev, ...renamed }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function renameFolder(sourceId, folderKey, newName) {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    const safe = stripDiacritics(newName.trim()).replace(/[\\/]/g, '-')
    if (!safe) return
    const folderBase = (src.folder || '').replace(/\/$/, '')
    const lastSlash = folderKey.lastIndexOf('/')
    const parentKey = lastSlash >= 0 ? folderKey.slice(0, lastSlash) : ''
    const newKey = parentKey ? `${parentKey}/${safe}` : safe
    if (newKey === folderKey) return
    const oldPath = folderBase ? `${folderBase}/${folderKey}` : folderKey
    const newPath = folderBase ? `${folderBase}/${newKey}` : newKey

    setLoading(true); setError(null)
    try {
      await window.api.github.renameFolder({ oldPath, newPath })
      const oldPrefix = `${oldPath}/`
      const newPrefix = `${newPath}/`
      const prefix = folderBase ? `${folderBase}/` : ''
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: (prev[sourceId] || []).map(f => {
          if (!f.path.startsWith(oldPrefix)) return f
          const np = newPrefix + f.path.slice(oldPrefix.length)
          return { ...f, path: np, relativePath: np.startsWith(prefix) ? np.slice(prefix.length) : np }
        }),
      }))
      if (activeFile?.path?.startsWith(oldPrefix)) {
        const np = newPrefix + activeFile.path.slice(oldPrefix.length)
        setActiveFile(prev => ({ ...prev, path: np, relativePath: np.startsWith(prefix) ? np.slice(prefix.length) : np }))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteFolder(sourceId, folderKey) {
    const src = sources.find(s => s.id === sourceId)
    if (!src) return
    const folderBase = (src.folder || '').replace(/\/$/, '')
    const folderPath = folderBase ? `${folderBase}/${folderKey}` : folderKey

    setLoading(true); setError(null)
    try {
      await window.api.github.deleteFolder({ folderPath })
      const prefix = `${folderPath}/`
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: (prev[sourceId] || []).filter(f => !f.path.startsWith(prefix)),
      }))
      if (activeFile?.path?.startsWith(prefix)) clearActiveFile()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteFile(file, sourceId) {
    setLoading(true); setError(null)
    try {
      await window.api.github.deleteFile({ filePath: file.path, sha: file.sha })
      setFilesBySource(prev => ({
        ...prev,
        [sourceId]: (prev[sourceId] || []).filter(f => f.path !== file.path),
      }))
      if (activeFile?.path === file.path) clearActiveFile()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function clearActiveFile() {
    setActiveFile(null)
    setContent(''); setSavedContent('')
    setMeta({}); setSavedMeta({})
  }

  function getNoteUrl() {
    if (!activeFile || !config?.owner || !config?.repo) return null
    const branch = config.branch || 'main'
    const encodedPath = activeFile.path.split('/').map(encodeURIComponent).join('/')
    return `https://github.com/${config.owner}/${config.repo}/blob/${encodeURIComponent(branch)}/${encodedPath}`
  }

  function openOnGitHub() {
    const url = getNoteUrl()
    if (url) window.api.shell.openExternal(url)
  }

  function downloadActiveNote() {
    if (!activeFile || activeFile.sourceKind !== 'notes') return
    const fullContent = serializeFrontMatter(meta, content)
    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = activeFile.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copyShareUrl() {
    const url = getNoteUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied ✓')
      setTimeout(() => setStatus(''), 2000)
    } catch {
      setStatus('Copy failed')
      setTimeout(() => setStatus(''), 2000)
    }
  }

  async function handleConfigSave(newConfig) {
    const migratedSources = migrateSources(newConfig)
    const finalCfg = { ...newConfig, sources: migratedSources }
    await window.api.config.save(finalCfg)
    setConfig(finalCfg)
    setSources(migratedSources)
    applyPreferences(finalCfg)
    setShowSettings(false)
    loadAllSources(migratedSources)
  }

  useEffect(() => {
    if (!config?.token || !config?.owner || !config?.repo) return
    const id = setInterval(() => loadAllSources(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [config?.token, config?.owner, config?.repo, sources])

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        saveFile()
      } else if (e.key === 'e' || e.key === 'E') {
        if (!activeFile || activeFile.sourceKind !== 'notes') return
        e.preventDefault()
        setMode(m => (m === 'edit' ? 'view' : 'edit'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFile, activeFile])

  const isNotesActive = activeFile?.sourceKind === 'notes'

  return (
    <div className="app">
      <Sidebar
        sources={sources}
        filesBySource={filesBySource}
        categoriesBySource={categoriesBySource}
        activeFile={activeFile}
        loading={loading}
        onFileSelect={openFile}
        onFileCreate={createFile}
        onFolderCreate={createFolder}
        onFileMove={moveFile}
        onFileRename={renameFile}
        onFolderRename={renameFolder}
        onUploadBinary={uploadBinary}
        onRequestDeleteFile={(file, sourceId) => setDeleteTarget({ type: 'file', file, sourceId })}
        onRequestDeleteFolder={(sourceId, key, name) => setDeleteTarget({ type: 'folder', sourceId, key, name })}
        onSettingsOpen={() => setShowSettings(true)}
        onSync={() => loadAllSources()}
        syncing={loading}
        lastSync={lastSync}
      />

      <div className="main">
        {isNotesActive ? (
          <Toolbar
            activeFile={activeFile}
            isDirty={isDirty}
            mode={mode}
            loading={loading}
            status={status}
            onModeToggle={() => setMode(m => (m === 'edit' ? 'view' : 'edit'))}
            onSave={saveFile}
            meta={meta}
            onMetaChange={setMeta}
            onOpenGitHub={openOnGitHub}
            onShareUrl={copyShareUrl}
            onDownload={downloadActiveNote}
            onRequestDelete={() => activeFile && setDeleteTarget({ type: 'file', file: activeFile, sourceId: activeFile.sourceId })}
          />
        ) : null}

        {offline && (
          <div className="offline-banner">
            Offline — showing cached files. Changes cannot be saved until reconnected.
          </div>
        )}

        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} — click to dismiss
          </div>
        )}

        {isNotesActive ? (
          <Editor
            content={toEditorMarkdown(content, activeFile?.path, config)}
            onChange={md => setContent(toStorageMarkdown(md, activeFile?.path, config))}
            mode={mode}
            activeFile={activeFile}
            onImageUpload={uploadImage}
          />
        ) : activeFile ? (
          <FilesViewer
            file={activeFile}
            config={config}
            onSaved={onFilesSaved}
            onOpenGitHub={openOnGitHub}
            onCopyUrl={copyShareUrl}
            onRequestDelete={() => setDeleteTarget({ type: 'file', file: activeFile, sourceId: activeFile.sourceId })}
            status={status}
            setStatus={setStatus}
            setError={setError}
          />
        ) : (
          <Editor activeFile={null} mode="view" content="" onChange={() => {}} onImageUpload={() => {}} />
        )}
      </div>

      {deleteTarget && (
        <div className="overlay" onClick={() => setDeleteTarget(null)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            {deleteTarget.type === 'folder' ? (
              <>
                <p>Delete folder <strong>{deleteTarget.name}</strong>?</p>
                <p className="dialog-sub">This will remove the folder and all its contents from GitHub. This cannot be undone.</p>
              </>
            ) : (
              <>
                <p>Delete <strong>{deleteTarget.file.name}</strong>?</p>
                <p className="dialog-sub">This will remove it from GitHub and cannot be undone.</p>
              </>
            )}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const t = deleteTarget
                  setDeleteTarget(null)
                  if (t.type === 'folder') deleteFolder(t.sourceId, t.key)
                  else deleteFile(t.file, t.sourceId)
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <Settings
          config={config}
          onSave={handleConfigSave}
          onClose={() => {
            if (!config?.token) return
            applyPreferences(config)
            setShowSettings(false)
          }}
          canClose={!!(config?.token && config?.owner && config?.repo)}
          genSourceId={genSourceId}
        />
      )}
    </div>
  )
}

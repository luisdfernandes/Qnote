import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Editor from './components/Editor'
import Settings from './components/Settings'

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

function safeDecode(s) {
  try { return decodeURI(s) } catch { return s }
}

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
  document.documentElement.style.setProperty(
    '--font-content',
    FONT_STACKS[font] ?? FONT_STACKS.system,
  )
  document.documentElement.style.setProperty('--accent', accent.color)
  document.documentElement.style.setProperty('--accent-dim', accent.dim)
}

export default function App() {
  const [config, setConfig] = useState(null)
  const [files, setFiles] = useState([])
  const [activeFile, setActiveFile] = useState(null)
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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [fileCategories, setFileCategories] = useState({}) // { path: [cat, cat] }

  const isDirty =
    content !== savedContent ||
    JSON.stringify(meta) !== JSON.stringify(savedMeta)

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    const cfg = await window.api.config.get()
    setConfig(cfg)
    applyPreferences(cfg)
    if (cfg.token && cfg.owner && cfg.repo) {
      loadFiles()
    } else {
      setShowSettings(true)
    }
  }

  async function loadFiles() {
    setLoading(true)
    setError(null)
    try {
      const { files, fromCache } = await window.api.github.listFiles()
      setFiles(files)
      setOffline(fromCache)
      if (!fromCache) setLastSync(Date.now())
      // Refresh category mapping in background — don't block UI
      window.api.github.loadAllMetadata()
        .then(setFileCategories)
        .catch(() => { /* non-fatal */ })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const openFile = useCallback(async (file) => {
    setLoading(true)
    setError(null)
    try {
      const { content: text, sha, fromCache } = await window.api.github.getFile(file.path)
      const { meta: parsedMeta, body } = parseFrontMatter(text)
      setActiveFile({ ...file, sha })
      setContent(body)
      setSavedContent(body)
      setMeta(parsedMeta)
      setSavedMeta(parsedMeta)
      if (fromCache) setOffline(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveFile = useCallback(async () => {
    if (!activeFile || !isDirty) return
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
      setMeta(newMeta)
      setSavedMeta(newMeta)
      setFiles(prev =>
        prev.map(f => (f.path === activeFile.path ? { ...f, sha } : f)),
      )
      setFileCategories(prev => {
        const cats = Array.isArray(newMeta.categories) ? newMeta.categories : []
        const next = { ...prev }
        if (cats.length) next[activeFile.path] = cats
        else delete next[activeFile.path]
        return next
      })
      setStatus('Saved ✓')
      setTimeout(() => setStatus(''), 2500)
      setMode('view')
    } catch (e) {
      setError(e.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }, [activeFile, content, isDirty, meta])

  async function createFile(name, subFolder = '') {
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const folderPath = (config.folder || '').replace(/\/$/, '')
    const sub = (subFolder || '').replace(/\/$/, '')
    const base = [folderPath, sub].filter(Boolean).join('/')
    const filePath = base ? `${base}/${fileName}` : fileName
    const title = fileName.replace(/\.md$/, '')

    setLoading(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const initialMeta = { categories: [], created: now, modified: now }
      const initialBody = `# ${title}\n\n`
      const { sha } = await window.api.github.saveFile({
        filePath,
        content: serializeFrontMatter(initialMeta, initialBody),
        sha: null,
      })
      const relativePath = sub ? `${sub}/${fileName}` : fileName
      const newFile = { name: fileName, path: filePath, sha, relativePath }
      setFiles(prev =>
        [...prev, newFile].sort((a, b) => a.name.localeCompare(b.name)),
      )
      await openFile(newFile)
      setMode('edit')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function uploadImage(base64Data, filename) {
    const folderPath = (config.folder || '').replace(/\/$/, '')
    const imagePath = folderPath ? `${folderPath}/images/${filename}` : `images/${filename}`
    const { url } = await window.api.github.uploadImage({ filePath: imagePath, base64Data })
    return url
  }

  async function moveFile(file, targetFolderKey) {
    const folderBase = (config.folder || '').replace(/\/$/, '')
    const newRelPath = targetFolderKey ? `${targetFolderKey}/${file.name}` : file.name
    const newFullPath = folderBase ? `${folderBase}/${newRelPath}` : newRelPath
    if (file.path === newFullPath) return

    setLoading(true)
    setError(null)
    try {
      const { sha } = await window.api.github.moveFile({ oldPath: file.path, newPath: newFullPath })
      const movedFile = { ...file, path: newFullPath, relativePath: newRelPath, sha }
      setFiles(prev =>
        prev.map(f => f.path === file.path ? movedFile : f)
          .sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name)),
      )
      if (activeFile?.path === file.path) {
        setActiveFile(movedFile)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function createFolder(name, parentFolder = '') {
    const folderBase = (config.folder || '').replace(/\/$/, '')
    const sub = (parentFolder || '').replace(/\/$/, '')
    const cleanName = name.trim().replace(/^\/|\/$/g, '')
    if (!cleanName) return
    const relativePath = sub ? `${sub}/${cleanName}` : cleanName
    const folderPath = folderBase ? `${folderBase}/${relativePath}` : relativePath

    setLoading(true)
    setError(null)
    try {
      await window.api.github.createFolder({ folderPath })
      await loadFiles()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function renameFile(file, newName) {
    let safe = newName.trim().replace(/[\\/]/g, '-')
    if (!safe) return
    if (!safe.endsWith('.md')) safe += '.md'
    const slash = file.path.lastIndexOf('/')
    const dir = slash >= 0 ? file.path.slice(0, slash) : ''
    const newPath = dir ? `${dir}/${safe}` : safe
    if (newPath === file.path) return

    const folderBase = (config.folder || '').replace(/\/$/, '')
    const prefix = folderBase ? `${folderBase}/` : ''
    const newRelPath = newPath.startsWith(prefix) ? newPath.slice(prefix.length) : newPath

    setLoading(true)
    setError(null)
    try {
      const { sha } = await window.api.github.moveFile({ oldPath: file.path, newPath })
      const renamed = { ...file, path: newPath, name: safe, relativePath: newRelPath, sha }
      setFiles(prev =>
        prev.map(f => (f.path === file.path ? renamed : f))
          .sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name)),
      )
      if (activeFile?.path === file.path) setActiveFile(renamed)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function renameFolder(folderKey, newName) {
    const safe = newName.trim().replace(/[\\/]/g, '-')
    if (!safe) return
    const folderBase = (config.folder || '').replace(/\/$/, '')
    const lastSlash = folderKey.lastIndexOf('/')
    const parentKey = lastSlash >= 0 ? folderKey.slice(0, lastSlash) : ''
    const newKey = parentKey ? `${parentKey}/${safe}` : safe
    if (newKey === folderKey) return

    const oldPath = folderBase ? `${folderBase}/${folderKey}` : folderKey
    const newPath = folderBase ? `${folderBase}/${newKey}` : newKey

    setLoading(true)
    setError(null)
    try {
      await window.api.github.renameFolder({ oldPath, newPath })
      const oldPrefix = `${oldPath}/`
      const newPrefix = `${newPath}/`
      setFiles(prev =>
        prev.map(f => {
          if (!f.path.startsWith(oldPrefix)) return f
          const np = newPrefix + f.path.slice(oldPrefix.length)
          const prefix = folderBase ? `${folderBase}/` : ''
          return { ...f, path: np, relativePath: np.startsWith(prefix) ? np.slice(prefix.length) : np }
        }),
      )
      if (activeFile?.path.startsWith(oldPrefix)) {
        const np = newPrefix + activeFile.path.slice(oldPrefix.length)
        const prefix = folderBase ? `${folderBase}/` : ''
        setActiveFile(prev => ({ ...prev, path: np, relativePath: np.startsWith(prefix) ? np.slice(prefix.length) : np }))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteFolder(folderKey) {
    const folderBase = (config.folder || '').replace(/\/$/, '')
    const folderPath = folderBase ? `${folderBase}/${folderKey}` : folderKey

    setLoading(true)
    setError(null)
    try {
      await window.api.github.deleteFolder({ folderPath })
      const prefix = `${folderPath}/`
      setFiles(prev => prev.filter(f => !f.path.startsWith(prefix)))
      if (activeFile && activeFile.path.startsWith(prefix)) {
        setActiveFile(null)
        setContent('')
        setSavedContent('')
        setMeta({})
        setSavedMeta({})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteFile(file) {
    setLoading(true)
    setError(null)
    try {
      await window.api.github.deleteFile({ filePath: file.path, sha: file.sha })
      setFiles(prev => prev.filter(f => f.path !== file.path))
      if (activeFile?.path === file.path) {
        setActiveFile(null)
        setContent('')
        setSavedContent('')
        setMeta({})
        setSavedMeta({})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
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
    await window.api.config.save(newConfig)
    setConfig(newConfig)
    applyPreferences(newConfig)
    setShowSettings(false)
    loadFiles()
  }

  useEffect(() => {
    if (!config?.token || !config?.owner || !config?.repo) return
    const id = setInterval(() => loadFiles(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [config?.token, config?.owner, config?.repo])

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        saveFile()
      } else if (e.key === 'e' || e.key === 'E') {
        if (!activeFile) return
        e.preventDefault()
        setMode(m => (m === 'edit' ? 'view' : 'edit'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFile, activeFile])

  return (
    <div className="app">
      <Sidebar
        files={files}
        activeFile={activeFile}
        loading={loading}
        onFileSelect={openFile}
        onFileCreate={createFile}
        onFolderCreate={createFolder}
        onFileMove={moveFile}
        onFileRename={renameFile}
        onFolderRename={renameFolder}
        onRequestDeleteFile={file => setDeleteTarget({ type: 'file', file })}
        onRequestDeleteFolder={(key, name) => setDeleteTarget({ type: 'folder', key, name })}
        onSettingsOpen={() => setShowSettings(true)}
        onSync={loadFiles}
        syncing={loading}
        lastSync={lastSync}
        fileCategories={fileCategories}
      />

      <div className="main">
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
          onRequestDelete={() => activeFile && setDeleteTarget({ type: 'file', file: activeFile })}
        />

        {offline && (
          <div className="offline-banner">
            Offline — showing cached notes. Changes cannot be saved until reconnected.
          </div>
        )}

        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} — click to dismiss
          </div>
        )}

        <Editor
          content={toEditorMarkdown(content, activeFile?.path, config)}
          onChange={md => setContent(toStorageMarkdown(md, activeFile?.path, config))}
          mode={mode}
          activeFile={activeFile}
          onImageUpload={uploadImage}
        />
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
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const target = deleteTarget
                  setDeleteTarget(null)
                  if (target.type === 'folder') deleteFolder(target.key)
                  else deleteFile(target.file)
                }}
              >
                Delete
              </button>
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
            applyPreferences(config) // revert any live previews
            setShowSettings(false)
          }}
          canClose={!!(config?.token && config?.owner && config?.repo)}
        />
      )}
    </div>
  )
}

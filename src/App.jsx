import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Editor from './components/Editor'
import Settings from './components/Settings'

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

function toEditorMarkdown(md, notePath, cfg) {
  const base = rawUrlBase(cfg)
  if (!md || !notePath || !base) return md
  const dir = noteDir(notePath)
  return md.replace(IMG_RE, (m, pre, src, title, post) => {
    if (/^[a-z]+:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/')) return m
    const full = resolveFromDir(dir, src)
    return `${pre}${base}${full}${title || ''}${post}`
  })
}

function toStorageMarkdown(md, notePath, cfg) {
  const base = rawUrlBase(cfg)
  if (!md || !notePath || !base) return md
  const dir = noteDir(notePath)
  return md.replace(IMG_RE, (m, pre, src, title, post) => {
    if (!src.startsWith(base)) return m
    const full = src.slice(base.length)
    const rel = relativeFromDir(dir, full)
    return `${pre}${rel}${title || ''}${post}`
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
  const [mode, setMode] = useState('view')
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('')
  const [offline, setOffline] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const isDirty = content !== savedContent

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
      setActiveFile({ ...file, sha })
      setContent(text)
      setSavedContent(text)
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
      const { sha } = await window.api.github.saveFile({
        filePath: activeFile.path,
        content,
        sha: activeFile.sha,
      })
      setActiveFile(prev => ({ ...prev, sha }))
      setSavedContent(content)
      setFiles(prev =>
        prev.map(f => (f.path === activeFile.path ? { ...f, sha } : f)),
      )
      setStatus('Saved ✓')
      setTimeout(() => setStatus(''), 2500)
      setMode('view')
    } catch (e) {
      setError(e.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }, [activeFile, content, isDirty])

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
      const { sha } = await window.api.github.saveFile({
        filePath,
        content: `# ${title}\n\n`,
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
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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
          onRefresh={loadFiles}
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

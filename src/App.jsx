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

function applyPreferences(cfg) {
  const theme = cfg?.theme || 'dark'
  const font  = cfg?.font  || 'system'
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.setProperty(
    '--font-content',
    FONT_STACKS[font] ?? FONT_STACKS.system,
  )
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
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveFile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFile])

  return (
    <div className="app">
      <Sidebar
        files={files}
        activeFile={activeFile}
        loading={loading}
        onFileSelect={openFile}
        onFileCreate={createFile}
        onFileDelete={deleteFile}
        onFileMove={moveFile}
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

      {showSettings && (
        <Settings
          config={config}
          onSave={handleConfigSave}
          onClose={() => config?.token ? setShowSettings(false) : null}
          canClose={!!(config?.token && config?.owner && config?.repo)}
        />
      )}
    </div>
  )
}

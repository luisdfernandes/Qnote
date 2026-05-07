import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Editor from './components/Editor'
import Settings from './components/Settings'

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
      setFiles(await window.api.github.listFiles())
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
      const { content: text, sha } = await window.api.github.getFile(file.path)
      setActiveFile({ ...file, sha })
      setContent(text)
      setSavedContent(text)
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

  async function createFile(name) {
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const folderPath = (config.folder || '').replace(/\/$/, '')
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName
    const title = fileName.replace(/\.md$/, '')

    setLoading(true)
    setError(null)
    try {
      const { sha } = await window.api.github.saveFile({
        filePath,
        content: `# ${title}\n\n`,
        sha: null,
      })
      const newFile = { name: fileName, path: filePath, sha }
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

        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} — click to dismiss
          </div>
        )}

        <Editor
          content={content}
          onChange={setContent}
          mode={mode}
          activeFile={activeFile}
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

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import hljs from 'highlight.js'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function base64ToBlob(base64, mime) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'yml', 'yaml', 'xml', 'html', 'htm',
  'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'svelte',
  'py', 'rb', 'php', 'java', 'kt', 'swift', 'go', 'rs', 'c', 'cpp', 'cc', 'cxx',
  'h', 'hpp', 'cs', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'lua', 'pl',
  'r', 'dart', 'toml', 'ini', 'conf', 'env', 'log', 'gitignore', 'dockerfile',
])
const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','bmp','ico'])

const HLJS_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  py: 'python', rb: 'ruby', sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell', yml: 'yaml', md: 'markdown',
}

function extOf(name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}
function kindOf(name) {
  const ext = extOf(name)
  if (TEXT_EXTS.has(ext) || ext === '') return 'text'
  if (IMAGE_EXTS.has(ext)) return 'image'
  return 'binary'
}

export default function FilesViewer({
  file,
  config,
  onSaved,
  onOpenGitHub,
  onCopyUrl,
  onRequestDelete,
  status,
  setStatus,
  setError,
}) {
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [imageBase64, setImageBase64] = useState(null)
  const [size, setSize] = useState(0)
  const [mode, setMode] = useState('view') // text mode only
  const [saving, setSaving] = useState(false)
  const previewRef = useRef(null)

  const kind = useMemo(() => kindOf(file.name), [file.name])
  const ext = extOf(file.name)
  const isDirty = kind === 'text' && content !== savedContent

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setContent(''); setSavedContent(''); setImageBase64(null); setMode('view')
      try {
        if (kind === 'text') {
          const { content: text } = await window.api.github.getFile(file.path)
          if (cancelled) return
          setContent(text); setSavedContent(text)
        } else if (kind === 'image') {
          const { base64, size: s } = await window.api.github.getFileBinary(file.path)
          if (cancelled) return
          setImageBase64(base64); setSize(s || 0)
        } else {
          const { size: s } = await window.api.github.getFileBinary(file.path)
          if (cancelled) return
          setSize(s || 0)
        }
      } catch (e) {
        if (!cancelled) setError?.(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [file.path, kind])

  useEffect(() => {
    if (kind !== 'text' || mode !== 'view' || !previewRef.current) return
    previewRef.current.querySelectorAll('pre code').forEach(el => {
      hljs.highlightElement(el)
    })
  }, [mode, content, kind])

  async function save() {
    if (!isDirty) return
    setSaving(true); setStatus?.('Saving…')
    try {
      const { sha } = await window.api.github.saveFile({
        filePath: file.path, content, sha: file.sha,
      })
      setSavedContent(content)
      onSaved?.(file, sha)
      setStatus?.('Saved ✓')
      setTimeout(() => setStatus?.(''), 2000)
      setMode('view')
    } catch (e) {
      setError?.(e.message); setStatus?.('')
    } finally {
      setSaving(false)
    }
  }

  function downloadBinary() {
    if (!config?.owner || !config?.repo) return
    const branch = config.branch || 'main'
    const encoded = file.path.split('/').map(encodeURIComponent).join('/')
    const url = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${branch}/${encoded}`
    window.api.shell.openExternal(url)
  }

  async function downloadFile() {
    try {
      if (kind === 'text' && content) {
        downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), file.name)
        return
      }
      if (imageBase64) {
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
        downloadBlob(base64ToBlob(imageBase64, mime), file.name)
        return
      }
      // Fallback: fetch the binary now and save
      const { base64 } = await window.api.github.getFileBinary(file.path)
      downloadBlob(base64ToBlob(base64), file.name)
    } catch (e) {
      setError?.(e.message)
    }
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const toolbar = (
    <div className="toolbar">
      <div className="toolbar-left">
        {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
        <span className="files-viewer-name">{file.name}</span>
        {size > 0 && (
          <span className="files-viewer-size">{formatBytes(size)}</span>
        )}
      </div>
      <div className="toolbar-right">
        {status && <span className="status-msg">{status}</span>}

        <button className="btn-icon toolbar-mode-btn" onClick={onCopyUrl} title="Copy GitHub link">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>
          </svg>
        </button>
        <button className="btn-icon toolbar-mode-btn" onClick={downloadFile} title="Download">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        <button className="btn-icon toolbar-mode-btn" onClick={onOpenGitHub} title="Open on GitHub">
          <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </button>

        {kind === 'text' && (
          <button
            className={`btn-icon toolbar-mode-btn ${mode === 'view' ? 'is-active' : ''}`}
            onClick={() => setMode(m => m === 'edit' ? 'view' : 'edit')}
            title={mode === 'edit' ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)'}
          >
            {mode === 'edit' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            )}
          </button>
        )}

        {(kind === 'text' && mode === 'edit') && (
          <button className="btn-icon toolbar-delete-btn" onClick={onRequestDelete} title="Delete file">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        )}
        {kind !== 'text' && (
          <button className="btn-icon toolbar-delete-btn" onClick={onRequestDelete} title="Delete file">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        )}

        {kind === 'text' && (
          <button className="btn btn-primary" onClick={save} disabled={!isDirty || saving} title="Save (Ctrl+S)">
            Save
          </button>
        )}
      </div>
    </div>
  )

  // ── Body ───────────────────────────────────────────────────────────────────
  let body
  if (loading) {
    body = <div className="files-viewer-empty"><p>Loading…</p></div>
  } else if (kind === 'text') {
    body = (
      <div className="editor-scroll">
        <HighlightedEditor
          value={content}
          onChange={setContent}
          language={HLJS_LANG[ext] || ext}
          editable={mode === 'edit'}
        />
      </div>
    )
  } else if (kind === 'image') {
    const src = imageBase64
      ? (ext === 'svg'
          ? `data:image/svg+xml;base64,${imageBase64}`
          : `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${imageBase64}`)
      : null
    body = (
      <div className="editor-scroll">
        <div className="content-center files-image-wrap">
          {src && <img src={src} alt={file.name} className="files-image" />}
        </div>
      </div>
    )
  } else {
    body = (
      <div className="files-viewer-empty">
        <p><strong>{file.name}</strong></p>
        <p className="dialog-sub">Binary file ({formatBytes(size)}). Preview not supported.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={downloadBinary}>Download / Open raw</button>
          <button className="btn btn-ghost" onClick={onOpenGitHub}>Open on GitHub</button>
        </div>
      </div>
    )
  }

  // Save shortcut
  useEffect(() => {
    if (kind !== 'text') return
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); save() }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setMode(m => m === 'edit' ? 'view' : 'edit') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [content, isDirty, kind])

  return (
    <>
      {toolbar}
      {body}
    </>
  )
}

function HighlightedEditor({ value, onChange, language, editable = true }) {
  const taRef = useRef(null)
  const preRef = useRef(null)

  const lang = useMemo(() => {
    if (language && hljs.getLanguage(language)) return language
    return null
  }, [language])

  const html = useMemo(() => {
    const safe = (value || '') + '\n'
    if (lang) {
      try { return hljs.highlight(safe, { language: lang, ignoreIllegals: true }).value }
      catch { /* fall through */ }
    }
    return safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }, [value, lang])

  const syncScroll = useCallback(() => {
    const ta = taRef.current, pre = preRef.current
    if (!ta || !pre) return
    pre.scrollTop = ta.scrollTop
    pre.scrollLeft = ta.scrollLeft
  }, [])

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart, end = ta.selectionEnd
    const next = value.slice(0, start) + '  ' + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
  }

  return (
    <div className="files-edit-wrap">
      <pre
        ref={preRef}
        className={`files-edit-highlight${editable ? ' is-overlay' : ''}`}
        aria-hidden={editable ? 'true' : 'false'}
      >
        <code className={lang ? `language-${lang}` : ''} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {editable && (
        <textarea
          ref={taRef}
          className="files-edit-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
        />
      )}
    </div>
  )
}

function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

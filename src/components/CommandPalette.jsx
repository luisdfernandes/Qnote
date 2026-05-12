import { useState, useEffect, useRef, useMemo } from 'react'

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'excalidraw') return '✏'
  if (ext === 'md') return '📄'
  if (['png','jpg','jpeg','gif','svg','webp','bmp','ico'].includes(ext)) return '🖼'
  if (['mp4','mov','webm','avi','mkv'].includes(ext)) return '🎬'
  if (['mp3','wav','ogg','m4a','flac'].includes(ext)) return '♪'
  if (ext === 'pdf') return '📕'
  if (['zip','tar','gz','7z','rar'].includes(ext)) return '🗜'
  if (['doc','docx'].includes(ext)) return '📘'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['ppt','pptx'].includes(ext)) return '📙'
  return '📄'
}

function highlightSubstring(text, query) {
  if (!query) return <span>{text}</span>
  const q = query.toLowerCase()
  const lower = text.toLowerCase()
  const parts = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(q, i)
    if (idx < 0) { parts.push(<span key={i}>{text.slice(i)}</span>); break }
    if (idx > i) parts.push(<span key={i}>{text.slice(i, idx)}</span>)
    parts.push(<mark key={idx} className="search-highlight">{text.slice(idx, idx + q.length)}</mark>)
    i = idx + q.length
  }
  return <>{parts}</>
}

export default function CommandPalette({ sources, filesBySource, onOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [serverResults, setServerResults] = useState([])
  const [pending, setPending] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const allFiles = useMemo(() => {
    const items = []
    for (const src of sources) {
      for (const f of (filesBySource[src.id] || [])) {
        if (!f.name.endsWith('.md') && !f.name.endsWith('.excalidraw')) continue
        items.push({ file: f, sourceId: src.id, sourceName: src.name })
      }
    }
    return items
  }, [sources, filesBySource])

  // Debounced server-side content + title search.
  useEffect(() => {
    const q = query.trim()
    if (!q) { setServerResults([]); setPending(false); return }
    setPending(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const r = await window.api.github.search(q)
        if (!cancelled) setServerResults(r || [])
      } catch {
        if (!cancelled) setServerResults([])
      } finally {
        if (!cancelled) setPending(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const results = useMemo(() => {
    if (!query.trim()) {
      return allFiles.slice(0, 50)
    }
    // Map server results (which have path + name) back to (file, sourceId) pairs.
    const sourceForPath = (p) => {
      const src = sources.find(s => {
        const folder = (s.folder || '').replace(/^\/|\/$/g, '')
        return folder ? p.startsWith(folder + '/') : true
      }) || sources[0]
      return src
    }
    return serverResults
      .filter(r => r.name.endsWith('.md') || r.name.endsWith('.excalidraw'))
      .slice(0, 50)
      .map(r => {
        const src = sourceForPath(r.path)
        return { file: r, sourceId: src?.id, sourceName: src?.name, snippet: r.snippet }
      })
  }, [query, allFiles, serverResults, sources])

  useEffect(() => { setActiveIdx(0) }, [query, serverResults])

  useEffect(() => {
    inputRef.current?.focus()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[activeIdx]
      if (item) onOpen(item.file, item.sourceId)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input-row">
          <svg className="cmd-palette-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            placeholder="Go to note…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            spellCheck={false}
            autoFocus
          />
          <kbd className="cmd-palette-esc">Esc</kbd>
        </div>
        <div className="cmd-palette-results" ref={listRef}>
          {pending && results.length === 0 && (
            <div className="cmd-palette-empty">Searching…</div>
          )}
          {!pending && results.length === 0 && (
            <div className="cmd-palette-empty">No notes match "{query}"</div>
          )}
          {results.map((item, i) => {
            const title = item.file.name.replace(/\.(md|excalidraw)$/, '')
            const sub = item.file.relativePath
              ? item.file.relativePath.split('/').slice(0, -1).join(' / ')
              : item.sourceName
            return (
              <div
                key={item.file.path}
                className={`cmd-palette-item${i === activeIdx ? ' active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => onOpen(item.file, item.sourceId)}
              >
                <span className="cmd-palette-item-icon">{fileIcon(item.file.name)}</span>
                <div className="cmd-palette-item-main">
                  <span className="cmd-palette-item-title">
                    {highlightSubstring(title, query)}
                  </span>
                  {item.snippet && (
                    <span className="cmd-palette-item-snippet">
                      {highlightSubstring(item.snippet, query)}
                    </span>
                  )}
                </div>
                {sub && <span className="cmd-palette-item-sub">{sub}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

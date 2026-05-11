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

function fuzzyMatch(query, str) {
  if (!query) return { matched: true, score: 0, ranges: [] }
  const q = query.toLowerCase()
  const s = str.toLowerCase()
  const ranges = []
  let si = 0
  let qi = 0
  while (qi < q.length && si < s.length) {
    if (q[qi] === s[si]) {
      const start = si
      while (qi < q.length && si < s.length && q[qi] === s[si]) { qi++; si++ }
      ranges.push([start, si])
    } else {
      si++
    }
  }
  if (qi < q.length) return { matched: false }
  // score: consecutive runs are better; earlier match is better
  const score = ranges.reduce((acc, [a, b]) => acc + (b - a) * (b - a), 0) - ranges[0][0] * 0.01
  return { matched: true, score, ranges }
}

function HighlightedTitle({ title, ranges }) {
  if (!ranges || !ranges.length) return <span>{title}</span>
  const parts = []
  let last = 0
  for (const [a, b] of ranges) {
    if (a > last) parts.push(<span key={last}>{title.slice(last, a)}</span>)
    parts.push(<mark key={a} className="search-highlight">{title.slice(a, b)}</mark>)
    last = b
  }
  if (last < title.length) parts.push(<span key={last}>{title.slice(last)}</span>)
  return <>{parts}</>
}

export default function CommandPalette({ sources, filesBySource, onOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
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

  const results = useMemo(() => {
    if (!query.trim()) {
      return allFiles.slice(0, 50).map(item => ({ ...item, ranges: [] }))
    }
    return allFiles
      .map(item => {
        const title = item.file.name.replace(/\.(md|excalidraw)$/, '')
        const m = fuzzyMatch(query, title)
        return m.matched ? { ...item, score: m.score, ranges: m.ranges } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
  }, [query, allFiles])

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    inputRef.current?.focus()
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
          />
          <kbd className="cmd-palette-esc">Esc</kbd>
        </div>
        <div className="cmd-palette-results" ref={listRef}>
          {results.length === 0 && (
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
                <span className="cmd-palette-item-title">
                  <HighlightedTitle title={title} ranges={item.ranges} />
                </span>
                {sub && <span className="cmd-palette-item-sub">{sub}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

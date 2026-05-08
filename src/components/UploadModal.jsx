import { useState, useRef, useCallback } from 'react'

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function UploadModal({
  sourceName,
  sourceKind,
  targetFolder,         // relative to source root, '' for root
  onClose,
  onUpload,             // async (name, base64, subFolder) => void
}) {
  const [files, setFiles] = useState([])
  const [statuses, setStatuses] = useState([])  // 'pending' | 'uploading' | 'done' | { error }
  const [uploading, setUploading] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const cancelRef = useRef(false)

  const isNotes = sourceKind === 'notes'

  function addFiles(list) {
    const incoming = Array.from(list || [])
    const filtered = isNotes
      ? incoming.filter(f => f.name.toLowerCase().endsWith('.md'))
      : incoming
    if (filtered.length === 0) return
    setFiles(prev => {
      const next = [...prev]
      const seen = new Set(prev.map(f => f.name))
      for (const f of filtered) if (!seen.has(f.name)) next.push(f)
      return next
    })
    setStatuses(prev => [...prev, ...filtered.map(() => 'pending')])
  }

  function removeFile(idx) {
    if (uploading) return
    setFiles(prev => prev.filter((_, i) => i !== idx))
    setStatuses(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }, [])

  async function startUpload() {
    if (files.length === 0 || uploading) return
    setUploading(true)
    setDoneCount(0)
    cancelRef.current = false
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break
      setStatuses(s => s.map((v, idx) => idx === i ? 'uploading' : v))
      try {
        const base64 = await readAsBase64(files[i])
        await onUpload(files[i].name, base64, targetFolder || '')
        setStatuses(s => s.map((v, idx) => idx === i ? 'done' : v))
        setDoneCount(c => c + 1)
      } catch (err) {
        console.error('Upload failed:', err)
        setStatuses(s => s.map((v, idx) => idx === i ? { error: err.message || 'Upload failed' } : v))
      }
    }
    setUploading(false)
  }

  function cancel() {
    cancelRef.current = true
  }

  const total = files.length
  const overallPct = total === 0 ? 0 : Math.round((doneCount / total) * 100)
  const allDone = total > 0 && doneCount === total && !uploading

  return (
    <div className="overlay" onClick={uploading ? undefined : onClose}>
      <div className="modal upload-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload to {sourceName}{targetFolder ? ` / ${targetFolder}` : ''}</h2>
          <button className="btn-icon" onClick={onClose} disabled={uploading}>×</button>
        </div>

        <div
          className={`upload-dropzone${dragOver ? ' is-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <div className="upload-dropzone-icon">↑</div>
          <p>Drop {isNotes ? '.md files' : 'files'} here, or click to browse</p>
          {isNotes && <p className="hint" style={{ padding: 0 }}>Only Markdown files are accepted in Notes sections.</p>}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={isNotes ? '.md,text/markdown' : undefined}
            style={{ display: 'none' }}
            onChange={e => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {files.length > 0 && (
          <>
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${overallPct}%` }} />
            </div>
            <div className="upload-progress-label">
              {uploading
                ? `Uploading ${doneCount + 1} of ${total}…`
                : allDone ? `Uploaded ${total} of ${total}`
                : `${total} file${total === 1 ? '' : 's'} ready`}
            </div>

            <div className="upload-file-list">
              {files.map((f, i) => {
                const st = statuses[i]
                const isErr = st && typeof st === 'object'
                return (
                  <div key={f.name + i} className={`upload-file-row ${isErr ? 'is-error' : st === 'done' ? 'is-done' : st === 'uploading' ? 'is-uploading' : ''}`}>
                    <span className="upload-file-status">
                      {st === 'done' ? '✓' :
                       st === 'uploading' ? '↑' :
                       isErr ? '✗' : '·'}
                    </span>
                    <span className="upload-file-name" title={f.name}>{f.name}</span>
                    <span className="upload-file-size">{fmtBytes(f.size)}</span>
                    {!uploading && st !== 'done' && (
                      <button
                        className="btn-icon upload-file-remove"
                        title="Remove"
                        onClick={() => removeFile(i)}
                      >×</button>
                    )}
                    {isErr && <span className="upload-file-error">{st.error}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          {uploading ? (
            <button type="button" className="btn btn-ghost" onClick={cancel}>Stop</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {allDone ? 'Close' : 'Cancel'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={startUpload}
            disabled={files.length === 0 || uploading || allDone}
          >
            {uploading ? 'Uploading…' : allDone ? 'Done' : `Upload ${files.length || ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

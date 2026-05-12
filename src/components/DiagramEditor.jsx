import { useState, useEffect, useRef, useCallback } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

const EMPTY_SCENE = {
  type: 'excalidraw',
  version: 2,
  elements: [],
  appState: { viewBackgroundColor: '#000000', gridSize: null },
  files: {},
}

export default function DiagramEditor({
  content,
  onChange,
  isDirty,
  loading,
  status,
  onSave,
  onOpenGitHub,
  onShareUrl,
  onRequestDelete,
}) {
  const [initialData, setInitialData] = useState(null)
  const changeTimer = useRef(null)
  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'

  useEffect(() => {
    try {
      const scene = content ? JSON.parse(content) : EMPTY_SCENE
      setInitialData({
        elements: scene.elements || [],
        appState: {
          ...(scene.appState || {}),
          collaborators: [],
        },
        files: scene.files || {},
      })
    } catch {
      setInitialData({ elements: [], appState: { collaborators: [] }, files: {} })
    }
    return () => clearTimeout(changeTimer.current)
  }, []) // intentionally only on mount — Excalidraw owns state after init

  const handleChange = useCallback((elements, appState, files) => {
    clearTimeout(changeTimer.current)
    changeTimer.current = setTimeout(() => {
      const scene = {
        type: 'excalidraw',
        version: 2,
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize ?? null,
        },
        files: files || {},
      }
      onChange(JSON.stringify(scene, null, 2))
    }, 250)
  }, [onChange])

  if (!initialData) return <div className="diagram-loading">Loading diagram…</div>

  return (
    <div className="diagram-editor">
      <div className="diagram-toolbar">
        {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
        <div style={{ flex: 1 }} />
        {status && <span className="status-msg">{status}</span>}
        <button className="btn-icon toolbar-mode-btn" onClick={onShareUrl} title="Copy GitHub link">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/>
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>
          </svg>
        </button>
        <button className="btn-icon toolbar-mode-btn" onClick={onOpenGitHub} title="Open on GitHub">
          <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </button>
        <button className="btn-icon toolbar-delete-btn" onClick={onRequestDelete} title="Delete diagram">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
        <button className="btn btn-primary" onClick={onSave} disabled={!isDirty || loading}>Save</button>
      </div>
      <div className="diagram-canvas">
        <Excalidraw
          initialData={initialData}
          onChange={handleChange}
          theme={theme}
          UIOptions={{
            canvasActions: { saveToActiveFile: false, loadScene: false, saveAsImage: true, clearCanvas: true },
          }}
        />
      </div>
    </div>
  )
}

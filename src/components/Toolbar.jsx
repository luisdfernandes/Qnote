export default function Toolbar({
  activeFile,
  isDirty,
  mode,
  loading,
  status,
  onModeToggle,
  onSave,
  onRefresh,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-filename">
          {activeFile
            ? activeFile.name.replace(/\.md$/, '')
            : 'QNote'}
          {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
        </span>
      </div>

      <div className="toolbar-right">
        {status && <span className="status-msg">{status}</span>}

        <button
          className="btn btn-icon-label"
          onClick={onRefresh}
          disabled={loading}
          title="Reload file list"
        >
          ↺
        </button>

        {activeFile && (
          <>
            <button
              className={`btn-icon toolbar-mode-btn ${mode === 'view' ? 'is-active' : ''}`}
              onClick={onModeToggle}
              title={mode === 'edit' ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)'}
            >
              {mode === 'edit' ? (
                /* Eye — switch to preview */
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              ) : (
                /* Pencil — switch back to edit */
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
            </button>

            <button
              className="btn btn-primary"
              onClick={onSave}
              disabled={!isDirty || loading}
              title="Save (Ctrl+S)"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  )
}

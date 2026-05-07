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
              className={`btn btn-ghost ${mode === 'view' ? 'btn-active' : ''}`}
              onClick={onModeToggle}
              title={mode === 'edit' ? 'Switch to preview' : 'Switch to edit'}
            >
              {mode === 'edit' ? 'Preview' : 'Edit'}
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

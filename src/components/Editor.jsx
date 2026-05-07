import { useEffect, useRef } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'

marked.use({ gfm: true, breaks: true })

export default function Editor({ content, onChange, mode, activeFile }) {
  const textareaRef = useRef(null)
  const previewRef  = useRef(null)

  // Focus textarea when switching to edit mode
  useEffect(() => {
    if (mode === 'edit') textareaRef.current?.focus()
  }, [mode, activeFile?.path])

  // Highlight all code blocks and add copy buttons after preview renders
  useEffect(() => {
    if (mode !== 'view' || !previewRef.current) return
    previewRef.current.querySelectorAll('pre code').forEach(el => {
      hljs.highlightElement(el)

      const pre = el.parentElement
      if (pre.querySelector('.copy-btn')) return

      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.textContent = 'Copy'
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(el.innerText).then(() => {
          btn.textContent = 'Copied!'
          setTimeout(() => { btn.textContent = 'Copy' }, 2000)
        })
      })
      pre.appendChild(btn)
    })
  }, [mode, content])

  if (!activeFile) {
    return (
      <div className="editor-empty">
        <div className="empty-state">
          <div className="empty-logo">Q</div>
          <p>Select a note from the sidebar or create a new one</p>
        </div>
      </div>
    )
  }

  if (mode === 'view') {
    return (
      <div className="editor-scroll">
        <div className="content-center">
          <div
            ref={previewRef}
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: marked.parse(content || '') }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="editor-scroll">
      <div className="content-center">
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={content}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          placeholder="Start writing in Markdown…"
        />
      </div>
    </div>
  )
}

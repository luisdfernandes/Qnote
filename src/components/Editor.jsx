import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'

marked.use({ gfm: true, breaks: true })

function ToolBtn({ title, active, disabled, onClick, children }) {
  return (
    <button
      className={`fmt-btn${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick() }}
    >{children}</button>
  )
}

function Sep() {
  return <div className="fmt-sep" />
}

function FormatBar({ editor }) {
  if (!editor) return <div className="format-bar" />

  const c = editor.chain().focus()
  const a = (type, attrs) => editor.isActive(type, attrs)

  return (
    <div className="format-bar">
      {/* Text style */}
      <ToolBtn title="Bold (Ctrl+B)"   active={a('bold')}   onClick={() => c.toggleBold().run()}><strong>B</strong></ToolBtn>
      <ToolBtn title="Italic (Ctrl+I)" active={a('italic')} onClick={() => c.toggleItalic().run()}><em>I</em></ToolBtn>
      <ToolBtn title="Strikethrough"   active={a('strike')} onClick={() => c.toggleStrike().run()}><s>S</s></ToolBtn>
      <ToolBtn title="Inline code"     active={a('code')}   onClick={() => c.toggleCode().run()}>{'`'}</ToolBtn>
      <Sep />

      {/* Headings */}
      <ToolBtn title="Heading 1" active={a('heading', { level: 1 })} onClick={() => c.toggleHeading({ level: 1 }).run()}>H1</ToolBtn>
      <ToolBtn title="Heading 2" active={a('heading', { level: 2 })} onClick={() => c.toggleHeading({ level: 2 }).run()}>H2</ToolBtn>
      <ToolBtn title="Heading 3" active={a('heading', { level: 3 })} onClick={() => c.toggleHeading({ level: 3 }).run()}>H3</ToolBtn>
      <Sep />

      {/* Blocks */}
      <ToolBtn title="Bullet list"   active={a('bulletList')}   onClick={() => c.toggleBulletList().run()}>≡</ToolBtn>
      <ToolBtn title="Ordered list"  active={a('orderedList')}  onClick={() => c.toggleOrderedList().run()}>№</ToolBtn>
      <ToolBtn title="Task list"     active={a('taskList')}     onClick={() => c.toggleTaskList().run()}>☑</ToolBtn>
      <ToolBtn title="Blockquote"    active={a('blockquote')}   onClick={() => c.toggleBlockquote().run()}>"</ToolBtn>
      <ToolBtn title="Code block"    active={a('codeBlock')}    onClick={() => c.toggleCodeBlock().run()}>{'</>'}</ToolBtn>
      <Sep />

      {/* Table */}
      {!a('table') ? (
        <ToolBtn title="Insert table" active={false} onClick={() => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞</ToolBtn>
      ) : (
        <>
          <ToolBtn title="Add column after"  active={false} onClick={() => c.addColumnAfter().run()}>+col</ToolBtn>
          <ToolBtn title="Delete column"     active={false} onClick={() => c.deleteColumn().run()}>−col</ToolBtn>
          <ToolBtn title="Add row after"     active={false} onClick={() => c.addRowAfter().run()}>+row</ToolBtn>
          <ToolBtn title="Delete row"        active={false} onClick={() => c.deleteRow().run()}>−row</ToolBtn>
          <ToolBtn title="Delete table"      active={false} onClick={() => c.deleteTable().run()}>✕tbl</ToolBtn>
        </>
      )}
      <Sep />

      {/* Misc */}
      <ToolBtn title="Horizontal rule" active={false} onClick={() => c.setHorizontalRule().run()}>—</ToolBtn>
      <ToolBtn title="Undo (Ctrl+Z)"   active={false} disabled={!editor.can().undo()} onClick={() => c.undo().run()}>↩</ToolBtn>
      <ToolBtn title="Redo (Ctrl+Y)"   active={false} disabled={!editor.can().redo()} onClick={() => c.redo().run()}>↪</ToolBtn>
    </div>
  )
}

function TiptapEditor({ content, onChange }) {
  const skipRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!skipRef.current) {
        onChange(editor.storage.markdown.getMarkdown())
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    skipRef.current = true
    editor.commands.setContent(content)
    skipRef.current = false
    editor.commands.focus('end')
  }, [editor])

  return (
    <div className="editor-with-bar">
      <FormatBar editor={editor} />
      <div className="editor-scroll">
        <div className="content-center">
          <EditorContent editor={editor} className="tiptap-editor" />
        </div>
      </div>
    </div>
  )
}

export default function Editor({ content, onChange, mode, activeFile }) {
  const previewRef = useRef(null)

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

  return <TiptapEditor key={activeFile.path} content={content} onChange={onChange} />
}

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { marked } from 'marked'
import hljs from 'highlight.js'
import iconSvg from '../../assets/icon.svg'

const lowlight = createLowlight(common)

marked.use({ gfm: true, breaks: true })

const LANGUAGES = [
  { value: '',           label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx',        label: 'JSX' },
  { value: 'tsx',        label: 'TSX' },
  { value: 'python',     label: 'Python' },
  { value: 'java',       label: 'Java' },
  { value: 'c',          label: 'C' },
  { value: 'cpp',        label: 'C++' },
  { value: 'csharp',     label: 'C#' },
  { value: 'go',         label: 'Go' },
  { value: 'rust',       label: 'Rust' },
  { value: 'ruby',       label: 'Ruby' },
  { value: 'php',        label: 'PHP' },
  { value: 'swift',      label: 'Swift' },
  { value: 'kotlin',     label: 'Kotlin' },
  { value: 'bash',       label: 'Bash / Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'sql',        label: 'SQL' },
  { value: 'html',       label: 'HTML' },
  { value: 'css',        label: 'CSS' },
  { value: 'json',       label: 'JSON' },
  { value: 'yaml',       label: 'YAML' },
  { value: 'toml',       label: 'TOML' },
  { value: 'xml',        label: 'XML' },
  { value: 'markdown',   label: 'Markdown' },
  { value: 'diff',       label: 'Diff' },
  { value: 'dockerfile', label: 'Dockerfile' },
]

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
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold:         e.isActive('bold'),
      italic:       e.isActive('italic'),
      strike:       e.isActive('strike'),
      code:         e.isActive('code'),
      h1:           e.isActive('heading', { level: 1 }),
      h2:           e.isActive('heading', { level: 2 }),
      h3:           e.isActive('heading', { level: 3 }),
      bulletList:   e.isActive('bulletList'),
      orderedList:  e.isActive('orderedList'),
      taskList:     e.isActive('taskList'),
      blockquote:   e.isActive('blockquote'),
      codeBlock:    e.isActive('codeBlock'),
      table:        e.isActive('table'),
      codeBlockLang: e.getAttributes('codeBlock').language || '',
      canUndo:      e.can().undo(),
      canRedo:      e.can().redo(),
    }),
  })

  if (!editor) return <div className="format-bar" />

  const c = editor.chain().focus()

  return (
    <div className="format-bar">
      {/* Text style */}
      <ToolBtn title="Bold (Ctrl+B)"   active={state.bold}   onClick={() => c.toggleBold().run()}><strong>B</strong></ToolBtn>
      <ToolBtn title="Italic (Ctrl+I)" active={state.italic} onClick={() => c.toggleItalic().run()}><em>I</em></ToolBtn>
      <ToolBtn title="Strikethrough"   active={state.strike} onClick={() => c.toggleStrike().run()}><s>S</s></ToolBtn>
      <ToolBtn title="Inline code"     active={state.code}   onClick={() => c.toggleCode().run()}>{'`'}</ToolBtn>
      <Sep />

      {/* Headings */}
      <ToolBtn title="Heading 1" active={state.h1} onClick={() => c.toggleHeading({ level: 1 }).run()}>H1</ToolBtn>
      <ToolBtn title="Heading 2" active={state.h2} onClick={() => c.toggleHeading({ level: 2 }).run()}>H2</ToolBtn>
      <ToolBtn title="Heading 3" active={state.h3} onClick={() => c.toggleHeading({ level: 3 }).run()}>H3</ToolBtn>
      <Sep />

      {/* Blocks */}
      <ToolBtn title="Bullet list"   active={state.bulletList}  onClick={() => c.toggleBulletList().run()}>≡</ToolBtn>
      <ToolBtn title="Ordered list"  active={state.orderedList} onClick={() => c.toggleOrderedList().run()}>№</ToolBtn>
      <ToolBtn title="Task list"     active={state.taskList}    onClick={() => c.toggleTaskList().run()}>☑</ToolBtn>
      <ToolBtn title="Blockquote"    active={state.blockquote}  onClick={() => c.toggleBlockquote().run()}>"</ToolBtn>
      <ToolBtn title="Code block"    active={state.codeBlock}   onClick={() => c.toggleCodeBlock().run()}>{'</>'}</ToolBtn>

      {state.codeBlock && (
        <>
          <Sep />
          <select
            className="fmt-lang-select"
            value={state.codeBlockLang}
            onChange={e => {
              editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value || null }).run()
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </>
      )}
      <Sep />

      {/* Table */}
      {!state.table ? (
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
      <ToolBtn title="Undo (Ctrl+Z)"   active={false} disabled={!state.canUndo} onClick={() => c.undo().run()}>↩</ToolBtn>
      <ToolBtn title="Redo (Ctrl+Y)"   active={false} disabled={!state.canRedo} onClick={() => c.redo().run()}>↪</ToolBtn>
    </div>
  )
}

function TiptapEditor({ content, onChange, onImageUpload }) {
  const skipRef = useRef(false)
  const uploadRef = useRef(onImageUpload)
  const editorRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  useEffect(() => { uploadRef.current = onImageUpload }, [onImageUpload])

  async function uploadAndInsert(base64, ext) {
    if (!uploadRef.current || !editorRef.current) return
    const filename = `pasted-${Date.now()}.${ext}`
    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadRef.current(base64, filename)
      editorRef.current.chain().focus().setImage({ src: url, alt: '' }).run()
    } catch (err) {
      console.error('Image upload error:', err)
      setUploadError(`Upload failed: ${err.message}`)
      setTimeout(() => setUploadError(null), 6000)
    } finally {
      setUploading(false)
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.extend({
        addStorage() {
          return {
            markdown: {
              serialize(state, node) {
                state.write('![' + (node.attrs.alt || '') + '](' +
                  node.attrs.src.replace(/[()]/g, '\\$&') +
                  (node.attrs.title ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"' : '') + ')')
                state.closeBlock(node)
              },
              parse: {},
            }
          }
        }
      }).configure({ inline: false, allowBase64: false }),
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
    editorProps: {
      handlePaste(view, event) {
        if (!uploadRef.current) return false

        const cd = event.clipboardData
        const items = Array.from(cd?.items || [])
        const files = Array.from(cd?.files || [])
        const hasText = !!(cd?.getData?.('text/plain'))

        // 1. Prefer DataTransfer image (works for most apps)
        let blob = null
        let mime = null
        const imageItem = items.find(i => i.type?.startsWith('image/'))
        if (imageItem) {
          blob = imageItem.getAsFile()
          mime = imageItem.type
        }
        if (!blob) {
          const imageFile = files.find(f => f.type?.startsWith('image/'))
          if (imageFile) { blob = imageFile; mime = imageFile.type }
        }

        if (blob) {
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = String(reader.result).split(',')[1]
            const ext = mime === 'image/jpeg' ? 'jpg' : (mime?.split('/')[1] || 'png')
            uploadAndInsert(base64, ext)
          }
          reader.readAsDataURL(blob)
          return true
        }

        // 2. Fallback: ask Electron's native clipboard (more reliable on Windows
        //    for screenshots from Snipping Tool, Greenshot, browsers, etc.)
        //    Skip if there is plain text — user is pasting text, not an image.
        if (!hasText && window.api?.clipboard?.readImage) {
          window.api.clipboard.readImage().then(base64 => {
            if (base64) uploadAndInsert(base64, 'png')
          }).catch(err => console.error('Clipboard image read failed:', err))
          return true
        }

        return false
      },
    },
    onUpdate: ({ editor }) => {
      if (!skipRef.current) {
        onChange(editor.storage.markdown.getMarkdown())
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    editorRef.current = editor
    skipRef.current = true
    editor.commands.setContent(content)
    skipRef.current = false
    editor.commands.focus('end')
  }, [editor])

  return (
    <div className="editor-with-bar">
      <FormatBar editor={editor} />
      {uploading && <div className="upload-toast">↑ Uploading image…</div>}
      {uploadError && <div className="upload-toast upload-toast-error">{uploadError}</div>}
      <div className="editor-scroll">
        <div className="content-center">
          <EditorContent editor={editor} className="tiptap-editor" />
        </div>
      </div>
    </div>
  )
}

export default function Editor({ content, onChange, mode, activeFile, onImageUpload }) {
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
          <img src={iconSvg} className="empty-logo" alt="Qnote" />
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

  return <TiptapEditor key={activeFile.path} content={content} onChange={onChange} onImageUpload={onImageUpload} />
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state'
import {
  AlertTriangle,
  Bold,
  Check,
  Code,
  Copy,
  Download,
  Heading,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetData } from '@/widgets/widgetData'
import { useWidgetDataSettings } from '@/widgets/useWidgetDataSettings'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { ScratchpadImage } from './scratchpadImage'
import { buildHtmlDocument, deriveTitle, DOWNLOAD_FILENAME, pickImageFiles, readAsDataUrl } from './scratchpadContent'
import './scratchpad.css'

const DEFAULT_DOC: JSONContent | null = null

type CopyStatus = 'idle' | 'copied' | 'failed'

/** Rich text notes that take pasted or dropped screenshots inline, for
 * debugging sessions where the plain-text Notes widget falls short. The
 * document is kept as TipTap JSON with images as `data:` URLs, so a note is
 * self-contained: copying or downloading it never depends on anything else. */
export default function ScratchpadWidget({ instanceId }: WidgetProps) {
  // The note is session state by default. "Remember content" moves it into
  // widget data, so it survives a reload (and Clear state).
  const [remember, setRemember] = useWidgetData(instanceId, 'remember', false)
  const dataEnabled = useWidgetDataSettings((state) => state.enabled)
  const [savedDoc, setSavedDoc] = useWidgetData<JSONContent | null>(instanceId, 'savedDoc', DEFAULT_DOC)
  const [sessionDoc, setSessionDoc] = useWidgetState<JSONContent | null>(instanceId, 'doc', DEFAULT_DOC)
  const doc = remember ? savedDoc : sessionDoc
  // Images make a note heavy; localStorage can refuse to store it.
  const [saveError, setSaveError] = useState<string | null>(null)
  const setDoc = (next: JSONContent | null) => {
    if (!remember) {
      setSessionDoc(next)
      return
    }
    try {
      setSavedDoc(next)
      setSaveError(null)
    } catch {
      setSaveError('This note is too large to remember in the browser. Edits are kept for this session only.')
    }
  }
  // The editor is uncontrolled (it reads `doc` once on mount). Remember what
  // it last wrote, so a change from outside (Reset data, widget data turned
  // off in Settings) can be loaded into it.
  const lastWrittenRef = useRef<JSONContent | null>(doc)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // UI-only, like TodoListWidget's expandedId: a failed read is worth a
  // note under the toolbar, not persisted state.
  const [imageError, setImageError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      ScratchpadImage,
      Placeholder.configure({ placeholder: 'Write, or paste a screenshot…' }),
    ],
    // Read once on mount; the store is the source of truth for remounts
    // (tab switch, overlay) and "Clear state" remounts with the default.
    content: doc ?? '',
    editorProps: {
      attributes: { 'aria-label': 'Scratchpad', 'aria-multiline': 'true', role: 'textbox' },
      handlePaste: (view, event) => {
        const files = pickImageFiles(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        void insertImages(view.state.selection.from, files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = pickImageFiles(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
        void insertImages(position, files)
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.isEmpty ? null : editor.getJSON()
      lastWrittenRef.current = next
      setDoc(next)
    },
  })

  useEffect(() => {
    if (!editor || doc === lastWrittenRef.current) return
    lastWrittenRef.current = doc
    editor.commands.setContent(doc ?? '', { emitUpdate: false })
  }, [editor, doc])

  // The note moves between state and widget data, so it never shows twice or
  // vanishes when toggled.
  const toggleRemember = (next: boolean) => {
    setSaveError(null)
    if (next) {
      try {
        setSavedDoc(sessionDoc)
      } catch {
        // Nothing could be stored: stay on session state rather than show a
        // ticked box that won't survive a reload. Dropping the data shrinks
        // what is stored, but don't count on that write succeeding either.
        try {
          useDashboardStore.getState().resetWidgetData(instanceId)
        } catch {
          // The in-memory store is already reset; only the write failed.
        }
        setSaveError('This note is too large to remember in the browser.')
        return
      }
      setRemember(true)
      setSessionDoc(DEFAULT_DOC)
      return
    }
    setSessionDoc(savedDoc)
    // The setters clear an unpinned overlay's fallback; the reset drops a
    // pinned instance's data so nothing stays saved or shared.
    setRemember(false)
    setSavedDoc(DEFAULT_DOC)
    useDashboardStore.getState().resetWidgetData(instanceId)
  }

  // Declared after useEditor (whose handlers close over it) but only ever
  // called from events, by which point `editor` is set.
  async function insertImages(position: number, files: File[]) {
    if (!editor) return
    // Reading a large screenshot takes a moment; keep the target position
    // pointing at the same spot if the note is edited in the meantime.
    // assoc -1 keeps it before text typed right at the caret, so the image
    // still comes first, in the order things were pasted and typed.
    let target = position
    const mapTarget = ({ transaction }: { transaction: Transaction }) => {
      target = transaction.mapping.map(target, -1)
    }
    editor.on('transaction', mapTarget)
    let sources: string[]
    try {
      sources = await Promise.all(files.map(readAsDataUrl))
    } catch {
      setImageError('Could not read that image.')
      return
    } finally {
      editor.off('transaction', mapTarget)
    }
    setImageError(null)
    editor
      .chain()
      .focus()
      .insertContentAt(
        target,
        sources.map((src, index) => ({ type: 'image', attrs: { src, alt: files[index].name || 'Pasted image' } })),
      )
      // Inserting at the edge of a paragraph leaves the last image
      // node-selected, so the next key would replace it. Move the caret into
      // the text after it instead, adding an empty paragraph when the image
      // ended the note. (Mid-paragraph inserts already leave a text caret.)
      .command(({ tr }) => {
        if (!(tr.selection instanceof NodeSelection)) return true
        const after = tr.selection.to
        if (!tr.doc.nodeAt(after)?.isTextblock) {
          tr.insert(after, tr.doc.type.schema.nodes.paragraph.create())
        }
        tr.setSelection(TextSelection.create(tr.doc, after + 1))
        return true
      })
      .scrollIntoView()
      .run()
  }

  const isEmpty = useEditorState({ editor, selector: ({ editor }) => editor?.isEmpty ?? true })
  // A remembered note is widget data, so only a session note counts as dirty.
  useWidgetDirty(instanceId, sessionDoc !== DEFAULT_DOC)

  const handlePickImages = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith('image/'))
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!editor || files.length === 0) return
    await insertImages(editor.state.selection.from, files)
  }

  const exportNote = () => {
    if (!editor) return null
    // Images have no text of their own; a marker keeps the plain-text
    // fallback from showing a silent gap where a screenshot was.
    const text = editor.getText({ blockSeparator: '\n\n', textSerializers: { image: () => '[image]' } })
    return { html: editor.getHTML(), text, title: deriveTitle(text) }
  }

  const handleDownload = () => {
    const note = exportNote()
    if (!note) return
    const url = URL.createObjectURL(new Blob([buildHtmlDocument(note.html, note.title)], { type: 'text/html' }))
    const link = document.createElement('a')
    link.href = url
    link.download = DOWNLOAD_FILENAME
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="flex h-full flex-col gap-1.5 text-xs">
      <div className="flex shrink-0 items-center gap-1">
        <Toolbar editor={editor} onInsertImage={() => fileInputRef.current?.click()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void handlePickImages(event.target.files)}
        />
        <div className="ml-auto flex shrink-0 items-center">
          <CopyNoteButton getNote={exportNote} disabled={isEmpty} />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={handleDownload}
            disabled={isEmpty}
            aria-label={`Download as ${DOWNLOAD_FILENAME}`}
            title={`Download as ${DOWNLOAD_FILENAME}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      </div>

      {imageError && <ErrorMessage>{imageError}</ErrorMessage>}
      {saveError && <ErrorMessage>{saveError}</ErrorMessage>}

      <EditorContent
        editor={editor}
        className="scratchpad min-h-0 flex-1 cursor-text overflow-auto rounded-md border border-border bg-background px-2.5 py-2 text-[13px] focus-within:border-ring/60 dark:bg-muted/40"
        onClick={(event) => {
          // Clicks in the padding below the last line should still focus.
          if (event.target === event.currentTarget) editor?.commands.focus('end')
        }}
      />

      {/* Always shown, so an empty remembered note can still be turned off. */}
      <label
        title={
          dataEnabled
            ? 'Keep the note after a reload. Saved in this browser, and in share links that include widget data. Images make the note, and the link, much larger.'
            : 'Widget data is turned off in Settings.'
        }
        className={cn('flex shrink-0 items-center gap-1.5 self-start', !dataEnabled && 'opacity-50')}
      >
        <input
          type="checkbox"
          checked={remember}
          disabled={!dataEnabled}
          onChange={(event) => toggleRemember(event.target.checked)}
          className="accent-primary"
        />
        Remember content
      </label>
    </div>
  )
}

function Toolbar({ editor, onInsertImage }: { editor: Editor | null; onInsertImage: () => void }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      strike: editor?.isActive('strike') ?? false,
      code: editor?.isActive('code') ?? false,
      heading: editor?.isActive('heading') ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
      orderedList: editor?.isActive('orderedList') ?? false,
      blockquote: editor?.isActive('blockquote') ?? false,
      codeBlock: editor?.isActive('codeBlock') ?? false,
    }),
  })

  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (editor) command(editor.chain().focus()).run()
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="scratchpad-toolbar flex min-w-0 items-center gap-px overflow-x-auto"
    >
      <ToolButton label="Bold" shortcut="Mod+B" pressed={active?.bold} onClick={() => run((c) => c.toggleBold())}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italic" shortcut="Mod+I" pressed={active?.italic} onClick={() => run((c) => c.toggleItalic())}>
        <Italic />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        shortcut="Mod+Shift+S"
        pressed={active?.strike}
        onClick={() => run((c) => c.toggleStrike())}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="Inline code"
        shortcut="Mod+E"
        pressed={active?.code}
        onClick={() => run((c) => c.toggleCode())}
      >
        <Code />
      </ToolButton>
      <Separator />
      <ToolButton
        label="Heading"
        shortcut="Mod+Alt+2"
        pressed={active?.heading}
        onClick={() => run((c) => c.toggleHeading({ level: 2 }))}
      >
        <Heading />
      </ToolButton>
      <ToolButton
        label="Bullet list"
        shortcut="Mod+Shift+8"
        pressed={active?.bulletList}
        onClick={() => run((c) => c.toggleBulletList())}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        shortcut="Mod+Shift+7"
        pressed={active?.orderedList}
        onClick={() => run((c) => c.toggleOrderedList())}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="Quote"
        shortcut="Mod+Shift+B"
        pressed={active?.blockquote}
        onClick={() => run((c) => c.toggleBlockquote())}
      >
        <Quote />
      </ToolButton>
      <ToolButton
        label="Code block"
        shortcut="Mod+Alt+C"
        pressed={active?.codeBlock}
        onClick={() => run((c) => c.toggleCodeBlock())}
      >
        <SquareCode />
      </ToolButton>
      <Separator />
      <ToolButton label="Insert image" onClick={onInsertImage}>
        <ImagePlus />
      </ToolButton>
    </div>
  )
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function formatShortcut(shortcut: string): string {
  return IS_MAC
    ? shortcut.replace('Mod+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥')
    : shortcut.replace('Mod', 'Ctrl')
}

function ToolButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      title={shortcut ? `${label} (${formatShortcut(shortcut)})` : label}
      // Keep the editor's selection: a mousedown on the button would
      // otherwise blur it before the command runs.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'text-muted-foreground hover:text-foreground [&_svg]:size-3.5',
        pressed && 'bg-muted text-foreground dark:bg-muted',
      )}
    >
      {children}
    </Button>
  )
}

function Separator() {
  return <span aria-hidden="true" className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
}

/** Writes the whole note as `text/html` (images embedded as data URLs) with
 * a `text/plain` fallback, so pasting into a docs editor or mail keeps the
 * formatting and pictures while a terminal or plain field still gets text.
 * Browsers without `ClipboardItem` get the plain text only. */
function CopyNoteButton({
  getNote,
  disabled,
}: {
  getNote: () => { html: string; text: string } | null
  disabled: boolean
}) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleCopy = async () => {
    const note = getNote()
    if (!note) return
    try {
      if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([note.html], { type: 'text/html' }),
            'text/plain': new Blob([note.text], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(note.text)
      }
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1200)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleCopy}
      disabled={disabled}
      aria-live="polite"
      title="Copy the note with its images"
      className={cn(
        'h-6 gap-1 rounded px-1.5 text-xs text-muted-foreground hover:text-foreground',
        status === 'failed' && 'text-destructive hover:text-destructive',
      )}
    >
      {status === 'copied' ? (
        <Check className="size-3.5" />
      ) : status === 'failed' ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}
    </Button>
  )
}

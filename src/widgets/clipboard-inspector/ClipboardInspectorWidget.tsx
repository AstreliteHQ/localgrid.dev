import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FocusEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Braces,
  Check,
  ClipboardList,
  ClipboardPaste,
  Code,
  Copy,
  Download,
  File,
  FileText,
  Image,
  Info,
  Link2,
  Puzzle,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { formatFileSize } from '@/widgets/image-converter/imageFormats'
import {
  copyMode,
  copyRepresentation,
  downloadName,
  FAMILY_LABELS,
  hasRemoteResources,
  hexDump,
  htmlPreviewDocument,
  parseUriList,
  prettyJson,
  readClipboardItems,
  readDataTransfer,
  rtfToPlainText,
  type ClipboardRepresentation,
  type FormatFamily,
} from './clipboardFormats'

type View = 'preview' | 'raw'
type Source = 'paste' | 'api'
type CopyStatus = 'idle' | 'copied' | 'failed'

const VIEW_OPTIONS: { label: string; value: View }[] = [
  { label: 'Preview', value: 'preview' },
  { label: 'Raw', value: 'raw' },
]

/** Raw views stop here so a multi-megabyte paste can't freeze the widget;
 * the full data is still one click away through Copy or Download. */
const MAX_RAW_CHARS = 200_000
const HEX_DUMP_BYTES = 1024

// Raw palette hues rather than the semantic tokens: the point of the badge
// is telling eight format families apart at a glance, and the theme only
// defines a handful of status colours.
const FAMILY_STYLES: Record<FormatFamily, { icon: LucideIcon; className: string }> = {
  text: { icon: Type, className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  markup: { icon: Code, className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  'rich-text': { icon: FileText, className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  link: { icon: Link2, className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  image: { icon: Image, className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  data: { icon: Braces, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  file: { icon: File, className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  custom: { icon: Puzzle, className: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300' },
}

function canReadClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
}

export default function ClipboardInspectorWidget({ instanceId }: WidgetProps) {
  const [representations, setRepresentations] = useWidgetState<ClipboardRepresentation[]>(
    instanceId,
    'representations',
    [],
  )
  const [selectedIndex, setSelectedIndex] = useWidgetState(instanceId, 'selected', 0)
  const [view, setView] = useWidgetState<View>(instanceId, 'view', 'preview')
  const [source, setSource] = useWidgetState<Source>(instanceId, 'source', 'paste')
  const [notice, setNotice] = useState<string | null>(null)
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false)
  // Bumped by every paste, read and clear, so a slow clipboard read (one
  // waiting on a permission prompt, say) can't overwrite what came after it.
  const latestActionRef = useRef(0)

  useWidgetDirty(instanceId, representations.length > 0)

  const selected = representations[Math.min(selectedIndex, representations.length - 1)] ?? null
  const totalSize = representations.reduce((sum, representation) => sum + representation.size, 0)

  const show = (next: ClipboardRepresentation[], from: Source) => {
    if (next.length === 0) {
      setNotice('The clipboard had nothing this browser can read. It may only hold app-specific formats.')
      return
    }
    setNotice(null)
    setRepresentations(next)
    setSelectedIndex(0)
    setSource(from)
  }

  // Bubbles up from whichever element inside the widget has focus, so a
  // paste works from the drop zone, the list or the detail pane alike.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!event.clipboardData) return
    event.preventDefault()
    latestActionRef.current += 1
    show(readDataTransfer(event.clipboardData), 'paste')
  }

  const handleReadClipboard = async () => {
    const action = ++latestActionRef.current
    try {
      const items = await navigator.clipboard.read()
      const next = await readClipboardItems(items)
      if (action === latestActionRef.current) show(next, 'api')
    } catch {
      if (action !== latestActionRef.current) return
      setNotice('The browser blocked clipboard access. Click the paste area and press Ctrl/Cmd+V instead.')
    }
  }

  const clear = () => {
    latestActionRef.current += 1
    setRepresentations([])
    setSelectedIndex(0)
    setNotice(null)
  }

  const handlePasteZoneBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setPasteZoneFocused(false)
  }

  const pasteHint = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors',
        pasteZoneFocused ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent',
      )}
    >
      <ClipboardPaste className={cn('size-3.5', pasteZoneFocused && 'animate-pulse')} />
      {pasteZoneFocused ? (
        <span className="inline-flex items-center gap-1">
          Ready to paste
          <kbd className="rounded border border-current/30 px-1 text-[10px] leading-4">Ctrl/⌘</kbd>
          <kbd className="rounded border border-current/30 px-1 text-[10px] leading-4">V</kbd>
        </span>
      ) : (
        'Click, then paste with Ctrl/Cmd+V'
      )}
    </span>
  )

  const readButton = canReadClipboard() && (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleReadClipboard}
      aria-label="Read clipboard"
      title="Read the clipboard without pasting"
      className="h-auto gap-1 px-2 py-1 text-xs"
    >
      <ClipboardList className="size-3.5" />
      <span className={cn(representations.length > 0 && 'hidden @md:inline')}>Read clipboard</span>
    </Button>
  )

  return (
    <div onPaste={handlePaste} className="@container flex h-full min-h-0 flex-col gap-2 text-xs">
      {representations.length === 0 ? (
        // Not a <button>: the area is the focus target a paste needs, and
        // only the Read clipboard button inside it acts on click.
        <div
          role="group"
          aria-label="Paste area. Click here, then paste with Ctrl or Cmd+V."
          tabIndex={0}
          onFocus={() => setPasteZoneFocused(true)}
          onBlur={handlePasteZoneBlur}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground outline-none transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          <ClipboardPaste className="size-6" />
          <span className="font-medium">Paste anything to inspect it</span>
          {pasteHint}
          {readButton}
          <span className="max-w-xs">
            Every format the clipboard carries shows up on its own: plain text, HTML, RTF, links, images and files.
          </span>
        </div>
      ) : (
        <div
          role="group"
          aria-label="Paste area. Click here, then paste with Ctrl or Cmd+V to replace the current clipboard."
          tabIndex={0}
          onFocus={() => setPasteZoneFocused(true)}
          onBlur={handlePasteZoneBlur}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-2 py-1.5 text-muted-foreground outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          <span className="font-medium text-foreground">
            {representations.length} {representations.length === 1 ? 'format' : 'formats'}
          </span>
          <span>{formatFileSize(totalSize)}</span>
          <span className="ml-auto flex items-center gap-1">
            <span className="hidden @md:inline-flex">{pasteHint}</span>
            {readButton}
            <Button type="button" variant="ghost" size="icon-xs" onClick={clear} aria-label="Clear" title="Clear">
              <X />
            </Button>
          </span>
        </div>
      )}

      {notice && <ErrorMessage>{notice}</ErrorMessage>}

      {selected && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 @xl:flex-row">
          <ul
            aria-label="Clipboard formats"
            className="flex max-h-[40%] shrink-0 flex-col gap-1 overflow-auto @xl:max-h-none @xl:w-56"
          >
            {representations.map((representation, index) => (
              <li key={index}>
                <RepresentationRow
                  representation={representation}
                  selected={representation === selected}
                  onSelect={() => setSelectedIndex(index)}
                />
              </li>
            ))}
          </ul>
          <RepresentationDetail
            // Remounts per selection so a "Copied" state never carries over.
            key={representations.indexOf(selected)}
            representation={selected}
            view={view}
            onViewChange={setView}
          />
        </div>
      )}

      <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
        <Info className="mt-px size-3 shrink-0" />
        {source === 'api' && representations.length > 0
          ? 'Read with the Clipboard API, which cleans up HTML and skips RTF. Paste with Ctrl/Cmd+V to see every format.'
          : 'Browsers only expose standard formats. Private formats from apps like Office, IDEs or design tools stay hidden.'}
      </p>
    </div>
  )
}

function FamilyBadge({ family }: { family: FormatFamily }) {
  const { icon: Icon, className } = FAMILY_STYLES[family]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        className,
      )}
    >
      <Icon className="size-3" />
      {FAMILY_LABELS[family]}
    </span>
  )
}

function RepresentationRow({
  representation,
  selected,
  onSelect,
}: {
  representation: ClipboardRepresentation
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border px-2 py-1 text-left transition-colors @xl:gap-1 @xl:py-1.5',
        selected ? 'border-ring bg-muted' : 'border-border/60 hover:bg-muted/50',
      )}
    >
      <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
        <FamilyBadge family={representation.family} />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground @xl:order-last @xl:basis-full"
          title={representation.type}
        >
          {representation.type}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
          {formatFileSize(representation.size)}
        </span>
      </span>
      {representation.fileName && (
        <span className="truncate text-[11px] text-muted-foreground" title={representation.fileName}>
          {representation.fileName}
        </span>
      )}
    </button>
  )
}

function RepresentationDetail({
  representation,
  view,
  onViewChange,
}: {
  representation: ClipboardRepresentation
  view: View
  onViewChange: (view: View) => void
}) {
  const { text } = representation
  const lineCount = text === null ? 0 : text.split('\n').length

  return (
    <section
      aria-label={`${representation.type} details`}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* The selected row above already names the format when stacked. */}
        <span className="hidden min-w-0 items-center gap-2 @xl:inline-flex">
          <FamilyBadge family={representation.family} />
          <span className="truncate font-mono font-medium" title={representation.type}>
            {representation.type}
          </span>
        </span>
        <span className="text-muted-foreground">
          {formatFileSize(representation.size)}
          {text !== null &&
            ` · ${text.length.toLocaleString()} chars · ${lineCount.toLocaleString()} ${lineCount === 1 ? 'line' : 'lines'}`}
        </span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {/* Side by side once there's room for both, a toggle below that. */}
          <SegmentedControl value={view} onChange={onViewChange} options={VIEW_OPTIONS} className="@4xl:hidden" />
          <CopyRepresentationButton representation={representation} />
          <DownloadButton representation={representation} />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <Pane title="Preview" className={cn(view !== 'preview' && 'hidden', '@4xl:flex')}>
          <Preview representation={representation} />
        </Pane>
        <Pane title="Raw" className={cn(view !== 'raw' && 'hidden', '@4xl:flex')}>
          <RawView representation={representation} />
        </Pane>
      </div>
    </section>
  )
}

function Pane({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={title} className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-1', className)}>
      <p className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground @4xl:block">{title}</p>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background dark:bg-muted/40">
        {children}
      </div>
    </div>
  )
}

function TextBlock({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={cn('whitespace-pre-wrap wrap-break-word p-2 font-mono text-[11px]', className)}>{children}</pre>
  )
}

function Preview({ representation }: { representation: ClipboardRepresentation }) {
  const { family, type, text } = representation
  const lowerType = type.toLowerCase()

  if (family === 'image') return <ImagePreview representation={representation} />

  if (text === null) {
    return (
      <div className="flex flex-col gap-1 p-2 text-muted-foreground">
        <p>No preview for this format. The first bytes are shown below.</p>
        <HexDump representation={representation} />
      </div>
    )
  }

  if (lowerType === 'text/html' || lowerType === 'application/xhtml+xml') {
    return (
      <div className="flex h-full flex-col">
        {hasRemoteResources(text) && (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            Remote images are blocked in this preview so nothing is fetched from other sites.
          </p>
        )}
        <iframe
          title="HTML preview"
          // Empty sandbox: no scripts, forms, popups or same-origin access.
          sandbox=""
          srcDoc={htmlPreviewDocument(text)}
          className="min-h-32 w-full flex-1 rounded-md bg-white"
        />
      </div>
    )
  }

  if (family === 'rich-text') {
    return (
      <div className="flex flex-col">
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          Text extracted from RTF. Browsers can't render RTF formatting.
        </p>
        <TextBlock className="font-sans text-xs">{rtfToPlainText(text)}</TextBlock>
      </div>
    )
  }

  if (family === 'link') {
    const urls = parseUriList(text)
    return (
      <ul className="flex flex-col gap-1 p-2">
        {urls.map((url, index) => (
          <li key={index} className="break-all">
            {/^https?:\/\//i.test(url) ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {url}
              </a>
            ) : (
              <span className="font-mono">{url}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (family === 'data' && lowerType.includes('json')) {
    const pretty = prettyJson(text)
    if (pretty !== null) return <TextBlock>{pretty}</TextBlock>
  }

  return <TextBlock className="font-sans text-xs">{truncate(text)}</TextBlock>
}

function RawView({ representation }: { representation: ClipboardRepresentation }) {
  if (representation.text === null) return <HexDump representation={representation} className="p-2" />
  return (
    <>
      {representation.text.length > MAX_RAW_CHARS && (
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          Showing the first {MAX_RAW_CHARS.toLocaleString()} characters. Copy or download for the rest.
        </p>
      )}
      <TextBlock>{truncate(representation.text)}</TextBlock>
    </>
  )
}

function truncate(text: string): string {
  return text.length > MAX_RAW_CHARS ? text.slice(0, MAX_RAW_CHARS) : text
}

function representationBlob(representation: ClipboardRepresentation): Blob {
  return representation.blob ?? new Blob([representation.text ?? ''], { type: representation.type })
}

function ImagePreview({ representation }: { representation: ClipboardRepresentation }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [dimensions, setDimensions] = useState<{
    source: ClipboardRepresentation
    width: number
    height: number
  } | null>(null)

  // The object URL goes straight onto the <img> so it lives exactly as long
  // as this effect, and is revoked when the selection changes or unmounts.
  useEffect(() => {
    const image = imageRef.current
    if (!image || typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(representationBlob(representation))
    image.src = url
    return () => {
      image.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [representation])

  const current = dimensions?.source === representation ? dimensions : null

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
      <img
        ref={imageRef}
        alt={`Pasted ${representation.type} image`}
        onLoad={(event) =>
          setDimensions({
            source: representation,
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
        className="max-h-full min-h-0 max-w-full rounded object-contain [background:repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)_0_0/12px_12px]"
      />
      {current && (
        <span className="text-[11px] text-muted-foreground">
          {current.width} × {current.height} px
        </span>
      )}
    </div>
  )
}

function HexDump({ representation, className }: { representation: ClipboardRepresentation; className?: string }) {
  const [dump, setDump] = useState<{ source: ClipboardRepresentation; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    representationBlob(representation)
      .slice(0, HEX_DUMP_BYTES)
      .arrayBuffer()
      .then((buffer) => {
        if (!cancelled) setDump({ source: representation, text: hexDump(new Uint8Array(buffer)) })
      })
      .catch(() => {
        if (!cancelled) setDump({ source: representation, text: 'Could not read these bytes.' })
      })
    return () => {
      cancelled = true
    }
  }, [representation])

  const current = dump?.source === representation ? dump.text : null

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <pre className="overflow-auto font-mono text-[11px] leading-4 text-foreground">{current ?? 'Reading…'}</pre>
      {representation.size > HEX_DUMP_BYTES && (
        <p className="text-[11px] text-muted-foreground">
          First {formatFileSize(HEX_DUMP_BYTES)} of {formatFileSize(representation.size)}.
        </p>
      )}
    </div>
  )
}

function CopyRepresentationButton({ representation }: { representation: ClipboardRepresentation }) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mode = useMemo(() => copyMode(representation), [representation])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  if (mode === 'none') return null

  const handleCopy = async () => {
    try {
      await copyRepresentation(representation)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1200)
  }

  const label =
    status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : mode === 'native' ? 'Copy' : 'Copy as text'

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleCopy}
      aria-live="polite"
      title={
        mode === 'native'
          ? `Put just the ${representation.type} format on the clipboard`
          : `Browsers can't write ${representation.type}, so this copies its source as plain text`
      }
      className={cn(
        'h-auto gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground',
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
      {label}
    </Button>
  )
}

function DownloadButton({ representation }: { representation: ClipboardRepresentation }) {
  const handleDownload = () => {
    const url = URL.createObjectURL(representationBlob(representation))
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName(representation)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleDownload}
      title={`Save as ${downloadName(representation)}`}
      className="h-auto gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Download className="size-3.5" />
      Download
    </Button>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FocusEvent } from 'react'
import { AlertTriangle, Check, Clipboard, ClipboardPaste, Download, FolderOpen, ImageUp, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { convertImage, toPngBlob, type ConversionResult } from './convertImage'
import {
  detectImageFormat,
  formatFileSize,
  IMAGE_FORMATS,
  listEncodableFormats,
  outputFileName,
  type ImageFormatId,
} from './imageFormats'

const DEFAULT_TARGET: ImageFormatId = 'png'
const DEFAULT_QUALITY = 90
/** Only the header is needed to identify a format, and reading the header
 * alone keeps a 40 MB drop from being pulled into memory twice. It matches
 * the window `detectImageFormat` scans for SVG: an XML declaration and a
 * doctype can push the root tag well past the first few dozen bytes. */
const HEADER_BYTES = 1024
/** Painted under images converted to a format with no alpha channel. White
 * rather than black: it is what every other converter does, and it keeps
 * dark-on-transparent logos readable. */
const MATTE = '#ffffff'

/** What the source file turned out to be. Kept together with the file it
 * describes so a stale detection is never shown next to a newer drop. */
interface Detection {
  file: File
  formatId: ImageFormatId | null
  error: string | null
}

/** Same idea for the output: tagged with the exact inputs that produced it,
 * so the result on screen always matches the current file, target and
 * quality instead of lingering for a render after one of them changes. */
interface Conversion {
  file: File
  formatId: ImageFormatId
  quality: number
  result: ConversionResult | null
  url: string | null
  error: string | null
}

type CopyStatus = 'idle' | 'copied' | 'failed'

/** Picks the file to paste out of a clipboard payload. An image copied from
 * a browser or another app usually rides alongside a `text/html` or
 * `text/plain` item describing it, so a `kind === 'file'` item typed
 * `image/*` is preferred; a same-kind item of another type is kept only as
 * a fallback, since the actual format is still sniffed from its bytes just
 * like a dropped file, never trusted from this type string. */
function fileFromClipboard(items: DataTransferItemList): File | null {
  let fallback: File | null = null
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.kind !== 'file') continue
    if (item.type.startsWith('image/')) return item.getAsFile()
    fallback ??= item.getAsFile()
  }
  return fallback
}

export default function ImageConverterWidget({ instanceId, mode }: WidgetProps) {
  const targets = useMemo(() => listEncodableFormats(), [])
  const [file, setFile] = useWidgetState<File | null>(instanceId, 'file', null)
  const [target, setTarget] = useWidgetState<ImageFormatId>(instanceId, 'target', DEFAULT_TARGET)
  const [quality, setQuality] = useWidgetState(instanceId, 'quality', DEFAULT_QUALITY)
  const [detection, setDetection] = useState<Detection | null>(null)
  const [conversion, setConversion] = useState<Conversion | null>(null)
  const [dragging, setDragging] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  // Whether the drop zone / file bar (whichever is currently rendered) is
  // focused, so the paste hint can say "ready" instead of "click first" —
  // the two states people actually need to tell apart, since a paste only
  // reaches whichever element has focus.
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Mirrors the currently published object URL so the previous one can be
  // revoked the moment a newer result replaces it.
  const urlRef = useRef<string | null>(null)

  useWidgetDirty(instanceId, file !== null || target !== DEFAULT_TARGET || quality !== DEFAULT_QUALITY)

  const targetFormat = IMAGE_FORMATS[target]
  const currentDetection = detection && detection.file === file ? detection : null
  const sourceFormatId = currentDetection?.formatId ?? null
  const sourceFormat = sourceFormatId ? IMAGE_FORMATS[sourceFormatId] : null
  const currentConversion =
    conversion && conversion.file === file && conversion.formatId === target && conversion.quality === quality
      ? conversion
      : null
  const result = currentConversion?.result ?? null
  const error = currentDetection?.error ?? currentConversion?.error ?? null
  const working = file !== null && error === null && result === null

  const publishUrl = useCallback((url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
  }, [])

  useEffect(() => () => publishUrl(null), [publishUrl])

  // Sniff the source format from the file's own bytes, not from its name or
  // from the MIME type the browser guessed for it (both are routinely
  // wrong, and often missing entirely on a dragged file).
  useEffect(() => {
    if (!file) return
    let cancelled = false
    file
      .slice(0, HEADER_BYTES)
      .arrayBuffer()
      .then((header) => {
        if (cancelled) return
        const format = detectImageFormat(new Uint8Array(header))
        setDetection({
          file,
          formatId: format?.id ?? null,
          error: format ? null : `Could not recognize ${file.name} as an image.`,
        })
      })
      .catch(() => {
        if (cancelled) return
        setDetection({ file, formatId: null, error: 'That file could not be read.' })
      })
    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    if (!file || !sourceFormat) return
    let cancelled = false
    convertImage(file, sourceFormat, targetFormat, { quality: quality / 100, matte: MATTE })
      .then((converted) => {
        if (cancelled) return
        const url = URL.createObjectURL(converted.blob)
        publishUrl(url)
        setConversion({ file, formatId: targetFormat.id, quality, result: converted, url, error: null })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        publishUrl(null)
        setConversion({
          file,
          formatId: targetFormat.id,
          quality,
          result: null,
          url: null,
          error: cause instanceof Error ? cause.message : 'Conversion failed.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [file, sourceFormat, targetFormat, quality, publishUrl])

  const accept = (next: File | null | undefined) => {
    if (!next) return
    // Release the previous result now rather than when the next conversion
    // finishes: a file that turns out to be unrecognized never starts one,
    // and its blob would sit in memory until the widget was cleared.
    publishUrl(null)
    setConversion(null)
    setFile(next)
    // The empty-state zone unmounts in favor of the file bar on this
    // change, taking real DOM focus with it — the freshly mounted bar
    // hasn't actually been focused yet, whatever this said a moment ago.
    // Replacing an already-loaded file reuses that same bar element rather
    // than remounting it, though, so real focus (and this) carry over.
    if (!file) setPasteZoneFocused(false)
  }

  const clear = () => {
    publishUrl(null)
    setFile(null)
    setDetection(null)
    setConversion(null)
    setPasteZoneFocused(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // A native `paste` event only reaches the currently focused element, so
  // both the empty drop zone and the loaded-file bar below carry their own
  // `tabIndex` and a visible focus ring — clicking into either (anywhere
  // but the Browse button, which opens the OS file picker instead) focuses
  // it and readies this handler, which then catches the bubbled event.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items
    if (!items) return
    const pasted = fileFromClipboard(items)
    if (!pasted) return
    event.preventDefault()
    accept(pasted)
  }

  // Focus moving from the zone to its own child (the Browse button, the
  // Remove button) still fires a native blur — the same `contains` check
  // `onDragLeave` above uses for its own zone-vs-child distinction — so
  // this only reports "unfocused" once focus has actually left the zone.
  const handlePasteZoneBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setPasteZoneFocused(false)
  }

  const handleCopyImage = async () => {
    if (result && typeof ClipboardItem !== 'undefined') {
      try {
        // Browsers only reliably accept a `ClipboardItem` typed image/png —
        // writing the JPEG/WebP/AVIF this conversion may have actually
        // produced is silently rejected, so the clipboard always gets a PNG
        // regardless of the chosen target format (the download is
        // unaffected, and stays in the requested format).
        //
        // toPngBlob's own promise is handed straight to ClipboardItem
        // rather than awaited first: Safari only allows a clipboard write
        // while still inside the click's own call stack, and awaiting here
        // would already have yielded past it by the time write() runs. The
        // key is `image/png` unconditionally since that's the only type
        // toPngBlob ever resolves to.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob(result.blob) })])
        setCopyStatus('copied')
      } catch {
        setCopyStatus('failed')
      }
    } else {
      setCopyStatus('failed')
    }
    clearTimeout(copyStatusTimeoutRef.current)
    copyStatusTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), 1200)
  }

  const sizeDelta = file && result && file.size > 0 ? Math.round((result.blob.size / file.size - 1) * 100) : null

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        // Moving between the drop zone's own children fires dragleave too;
        // only a leave of the zone itself should clear the highlight.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        accept(event.dataTransfer?.files?.[0])
      }}
      onPaste={handlePaste}
      className="flex h-full flex-col gap-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.avif,.heic,.heif,.jxl"
        className="hidden"
        aria-label="Image file"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {!file ? (
        // Not a <button>: the whole area is both the drop target and the
        // focus target a paste needs, and only the small Browse button
        // inside it should open the OS file picker on click.
        <div
          role="group"
          aria-label="Image drop zone. Click here, then paste with Ctrl or Cmd+V, or drag and drop a file."
          tabIndex={0}
          onFocus={() => setPasteZoneFocused(true)}
          onBlur={handlePasteZoneBlur}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground outline-none transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50',
            dragging && 'border-ring bg-muted/50 text-foreground',
          )}
        >
          <ImageUp className="size-6" />
          <span className="font-medium">Drop an image here</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className="h-auto gap-1 px-2 py-1 text-xs"
          >
            <FolderOpen className="size-3.5" />
            Browse
          </Button>
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
          <span>PNG, JPEG, WebP, GIF, AVIF, HEIC, BMP, TIFF, ICO, SVG.</span>
        </div>
      ) : (
        <>
          <div
            tabIndex={0}
            aria-label={`${file.name}. Click here, then paste with Ctrl or Cmd+V to replace it.`}
            onFocus={() => setPasteZoneFocused(true)}
            onBlur={handlePasteZoneBlur}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50',
              dragging && 'border-ring bg-muted/50',
            )}
          >
            <span className="truncate font-medium" title={file.name}>
              {file.name}
            </span>
            <span
              aria-label={`Detected source format: ${sourceFormat ? sourceFormat.label : 'Unknown'}`}
              className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground"
            >
              {sourceFormat ? sourceFormat.label : 'Unknown'}
            </span>
            <span className="ml-auto shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={clear}
              aria-label="Remove image"
              className="shrink-0 text-muted-foreground"
            >
              <X />
            </Button>
          </div>
          {/* Only shown once pasting actually becomes possible, which is
           * also the moment someone needs telling — hidden the rest of the
           * time to save space in a small widget. */}
          {pasteZoneFocused && (
            <p className="text-[11px] text-primary">
              <span className="inline-flex items-center gap-1">
                <ClipboardPaste className="size-3 animate-pulse" />
                Ready — press
                <kbd className="rounded border border-primary/30 px-1 text-[10px] leading-4">Ctrl/⌘</kbd>
                <kbd className="rounded border border-primary/30 px-1 text-[10px] leading-4">V</kbd>
                to replace
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={target}
              onChange={setTarget}
              options={targets.map((format) => ({ label: format.label, value: format.id }))}
              className="flex-wrap"
            />
            {targetFormat.lossy && (
              <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">Quality</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  className="h-1 min-w-16 flex-1 accent-primary"
                />
                <span className="w-8 shrink-0 text-right font-mono tabular-nums">{quality}</span>
              </label>
            )}
          </div>

          {currentConversion?.url && (
            <div
              className={cn(
                'flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2',
                mode === 'overlay' && 'p-4',
              )}
            >
              <img
                src={currentConversion.url}
                alt={`${targetFormat.label} preview`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {working && <span>Converting…</span>}
            {result && (
              <span className="truncate">
                {result.width} × {result.height} · {formatFileSize(result.blob.size)}
                {sizeDelta !== null && (
                  <span className={cn('ml-1', sizeDelta <= 0 ? 'text-success' : 'text-muted-foreground')}>
                    ({sizeDelta > 0 ? '+' : ''}
                    {sizeDelta}%)
                  </span>
                )}
              </span>
            )}
            {currentConversion?.url && (
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyImage}
                  aria-live="polite"
                  className={cn(
                    'h-auto gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground',
                    copyStatus === 'failed' && 'text-destructive hover:text-destructive',
                  )}
                >
                  {copyStatus === 'copied' ? (
                    <Check className="size-3.5" />
                  ) : copyStatus === 'failed' ? (
                    <AlertTriangle className="size-3.5" />
                  ) : (
                    <Clipboard className="size-3.5" />
                  )}
                  {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
                </Button>
                <a
                  href={currentConversion.url}
                  download={outputFileName(file.name, targetFormat)}
                  className={buttonVariants({ size: 'sm' })}
                >
                  <Download />
                  Download
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type FocusEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Clipboard,
  ClipboardPaste,
  Download,
  FolderOpen,
  ImageUp,
  Loader2,
  X,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { formatFileSize } from '@/widgets/image-converter/imageFormats'
import type { OptimizeResult, PngLayout } from './optimizePng'
import { COLOR_TYPE_LABELS } from './png'
import { runOptimizer } from './runOptimizer'

type ProfileMode = 'keep' | 'strip'

const DEFAULT_PROFILE: ProfileMode = 'keep'

/** The output, tagged with the exact inputs that produced it so a stale
 * result is never shown next to a newer file or setting. */
interface Optimization {
  file: File
  profile: ProfileMode
  result: OptimizeResult | null
  url: string | null
  error: string | null
}

type CopyStatus = 'idle' | 'copied' | 'failed'

function fileFromClipboard(items: DataTransferItemList): File | null {
  let fallback: File | null = null
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.kind !== 'file') continue
    if (item.type === 'image/png') return item.getAsFile()
    fallback ??= item.getAsFile()
  }
  return fallback
}

function describeLayout(layout: PngLayout): string {
  return `${COLOR_TYPE_LABELS[layout.colorType]} ${layout.bitDepth}-bit${layout.interlaced ? ', interlaced' : ''}`
}

/** Keeps the original name so the optimized file can simply replace it. */
function outputFileName(name: string): string {
  return /\.png$/i.test(name) ? name : `${name.replace(/\.[^.]*$/, '')}.png`
}

export default function PngOptimizerWidget({ instanceId, mode }: WidgetProps) {
  const [file, setFile] = useWidgetState<File | null>(instanceId, 'file', null)
  const [profile, setProfile] = useWidgetState<ProfileMode>(instanceId, 'profile', DEFAULT_PROFILE)
  const [optimization, setOptimization] = useState<Optimization | null>(null)
  const [dragging, setDragging] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const urlRef = useRef<string | null>(null)

  useWidgetDirty(instanceId, file !== null || profile !== DEFAULT_PROFILE)

  const current = optimization && optimization.file === file && optimization.profile === profile ? optimization : null
  const result = current?.result ?? null
  const error = current?.error ?? null
  const working = file !== null && current === null

  const publishUrl = useCallback((url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
  }, [])

  useEffect(() => () => publishUrl(null), [publishUrl])
  useEffect(() => () => clearTimeout(copyStatusTimeoutRef.current), [])

  useEffect(() => {
    if (!file) return
    let cancelled = false
    const controller = new AbortController()
    file
      .arrayBuffer()
      .then((buffer) =>
        runOptimizer(new Uint8Array(buffer), { keepColorProfile: profile === 'keep' }, controller.signal),
      )
      .then((optimized) => {
        if (cancelled) return
        const url = URL.createObjectURL(new Blob([optimized.bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
        publishUrl(url)
        setOptimization({ file, profile, result: optimized, url, error: null })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        publishUrl(null)
        setOptimization({
          file,
          profile,
          result: null,
          url: null,
          error: cause instanceof Error ? cause.message : 'Optimization failed.',
        })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [file, profile, publishUrl])

  const accept = (next: File | null | undefined) => {
    if (!next) return
    publishUrl(null)
    setOptimization(null)
    setFile(next)
    if (!file) setPasteZoneFocused(false)
  }

  const clear = () => {
    publishUrl(null)
    setFile(null)
    setOptimization(null)
    setPasteZoneFocused(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items
    if (!items) return
    const pasted = fileFromClipboard(items)
    if (!pasted) return
    event.preventDefault()
    accept(pasted)
  }

  const handlePasteZoneBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setPasteZoneFocused(false)
  }

  const handleCopyImage = async () => {
    if (result && typeof ClipboardItem !== 'undefined') {
      try {
        const blob = new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' })
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
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

  const saved = result ? result.originalSize - result.bytes.length : 0
  const savedPercent = result && result.originalSize > 0 ? Math.round((saved / result.originalSize) * 1000) / 10 : 0
  const layoutChanged =
    result &&
    (result.before.colorType !== result.after.colorType ||
      result.before.bitDepth !== result.after.bitDepth ||
      result.before.interlaced !== result.after.interlaced)

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
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
        accept="image/png,.png"
        className="hidden"
        aria-label="PNG file"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {!file ? (
        <div
          role="group"
          aria-label="PNG drop zone. Click here, then paste with Ctrl or Cmd+V, or drag and drop a file."
          tabIndex={0}
          onFocus={() => setPasteZoneFocused(true)}
          onBlur={handlePasteZoneBlur}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground outline-none transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50',
            dragging && 'border-ring bg-muted/50 text-foreground',
          )}
        >
          <ImageUp className="size-6" />
          <span className="font-medium">Drop a PNG here</span>
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
            {pasteZoneFocused ? 'Ready to paste' : 'Click, then paste with Ctrl/Cmd+V'}
          </span>
          <span>Lossless: every pixel stays identical.</span>
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

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Color profile</span>
            <SegmentedControl
              value={profile}
              onChange={setProfile}
              options={[
                { label: 'Keep', value: 'keep' },
                { label: 'Strip', value: 'strip' },
              ]}
            />
          </div>

          {working && (
            <div
              role="status"
              className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground"
            >
              <Loader2 className="size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <span>Optimizing…</span>
              <div className="h-1 w-32 max-w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate motion-reduce:animate-none" />
              </div>
            </div>
          )}

          {current?.url && (
            <div
              className={cn(
                'flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2',
                mode === 'overlay' && 'p-4',
              )}
            >
              <img src={current.url} alt="Optimized preview" className="max-h-full max-w-full object-contain" />
            </div>
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}

          {result && (
            <ul aria-label="Optimization details" className="space-y-0.5 text-xs text-muted-foreground">
              {result.alreadyOptimal ? (
                <li>Already optimal, nothing could be saved without changing pixels.</li>
              ) : (
                <>
                  {layoutChanged && (
                    <li>
                      {describeLayout(result.before)} to {describeLayout(result.after)}
                    </li>
                  )}
                  {result.filter && <li>{result.filter} filter, deflate level 9</li>}
                  {result.removedChunks.length > 0 && <li>Removed {result.removedChunks.join(', ')}</li>}
                </>
              )}
              {result.animated && <li>Animated PNG, frames left as they are.</li>}
            </ul>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {result && (
              <span className="truncate">
                {formatFileSize(result.originalSize)} to {formatFileSize(result.bytes.length)}
                {saved > 0 && <span className="ml-1 text-success">(-{savedPercent}%)</span>}
              </span>
            )}
            {current?.url && (
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
                <a href={current.url} download={outputFileName(file.name)} className={buttonVariants({ size: 'sm' })}>
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

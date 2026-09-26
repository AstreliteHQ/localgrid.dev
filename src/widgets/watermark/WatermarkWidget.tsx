import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Loader2, Stamp, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { detectFileKind, type FileKind } from './detectFileKind'
import { watermarkImage } from './watermarkImage'
import { watermarkPdf, type WatermarkPosition } from './watermarkPdf'

const DEFAULT_TEXT = ''
const DEFAULT_OPACITY = 30
const DEFAULT_COLOR = '#ff0000'
const DEFAULT_FONT_SIZE = 36
const DEFAULT_POSITION: WatermarkPosition = 'tiled'

interface Detection {
  file: File
  kind: FileKind | null
  error: string | null
}

interface Result {
  fileName: string
  url: string
  previewUrl: string | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1000
  let unitIndex = 0
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000
    unitIndex += 1
  }
  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ${units[unitIndex]}`
}

/** Inserts `-watermarked` before the extension, or appends it (with the
 * given fallback extension) when the source name has none. */
function watermarkedFileName(sourceName: string, extension: string): string {
  const dot = sourceName.lastIndexOf('.')
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName
  return `${base}-watermarked.${extension}`
}

export default function WatermarkWidget({ instanceId }: WidgetProps) {
  const [file, setFile] = useWidgetState<File | null>(instanceId, 'file', null)
  const [text, setText] = useWidgetState(instanceId, 'text', DEFAULT_TEXT)
  const [opacity, setOpacity] = useWidgetState(instanceId, 'opacity', DEFAULT_OPACITY)
  const [color, setColor] = useWidgetState(instanceId, 'color', DEFAULT_COLOR)
  const [fontSize, setFontSize] = useWidgetState(instanceId, 'fontSize', DEFAULT_FONT_SIZE)
  const [position, setPosition] = useWidgetState<WatermarkPosition>(instanceId, 'position', DEFAULT_POSITION)
  const [detection, setDetection] = useState<Detection | null>(null)
  const [dragging, setDragging] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Both the result's own download URL and (for an image) its preview URL,
  // so they can be revoked together the moment a newer result replaces them.
  const urlsRef = useRef<string[]>([])

  useWidgetDirty(
    instanceId,
    file !== null ||
      text !== DEFAULT_TEXT ||
      opacity !== DEFAULT_OPACITY ||
      color !== DEFAULT_COLOR ||
      fontSize !== DEFAULT_FONT_SIZE ||
      position !== DEFAULT_POSITION,
  )

  const publishUrls = (urls: string[]) => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
    urlsRef.current = urls
  }

  useEffect(() => () => publishUrls([]), [])

  useEffect(() => {
    if (!file) return
    let cancelled = false
    detectFileKind(file)
      .then((kind) => {
        if (cancelled) return
        setDetection({ file, kind, error: null })
      })
      .catch(() => {
        if (cancelled) return
        setDetection({ file, kind: null, error: `"${file.name}" could not be read.` })
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const currentDetection = detection && detection.file === file ? detection : null
  const kind = currentDetection?.kind ?? null

  const invalidateResult = () => {
    publishUrls([])
    setResult(null)
    setError(null)
  }

  const accept = (next: File | null | undefined) => {
    if (!next) return
    setFile(next)
    setDetection(null)
    invalidateResult()
  }

  const clear = () => {
    setFile(null)
    setDetection(null)
    invalidateResult()
    if (inputRef.current) inputRef.current.value = ''
  }

  const canApply = kind !== null && text.trim().length > 0 && !working

  const handleApply = async () => {
    if (!file || kind === null) return
    setWorking(true)
    setError(null)
    const options = { text, opacity: opacity / 100, color, fontSize, position }
    try {
      if (kind === 'pdf') {
        const bytes = await watermarkPdf(file, options)
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
        publishUrls([url])
        setResult({ fileName: watermarkedFileName(file.name, 'pdf'), url, previewUrl: null })
      } else {
        const watermarked = await watermarkImage(file, options)
        const url = URL.createObjectURL(watermarked.blob)
        publishUrls([url])
        setResult({ fileName: watermarkedFileName(file.name, 'png'), url, previewUrl: url })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add a watermark to this file.')
    } finally {
      setWorking(false)
    }
  }

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
      className="flex h-full flex-col gap-2 overflow-y-auto text-xs"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="hidden"
        aria-label="Image or PDF file"
        onChange={(event) => {
          accept(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      {!file ? (
        <div
          role="group"
          aria-label="Image or PDF drop zone"
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
            dragging && 'border-ring bg-muted/50 text-foreground',
          )}
        >
          <Stamp className="size-6" />
          <span className="font-medium">Drop an image or PDF here</span>
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
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
            <span className="truncate font-medium" title={file.name}>
              {file.name}
            </span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {!currentDetection ? 'Reading…' : currentDetection.error ? null : kind === 'pdf' ? 'PDF' : 'Image'}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
            <Button type="button" variant="ghost" size="icon-xs" onClick={clear} aria-label="Remove file" className="shrink-0 text-muted-foreground">
              <X />
            </Button>
          </div>

          {currentDetection?.error && <ErrorMessage>{currentDetection.error}</ErrorMessage>}

          {kind !== null && (
            <>
              <Field label="Text">
                <Input
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value)
                    invalidateResult()
                  }}
                  placeholder="e.g. CONFIDENTIAL"
                  aria-label="Watermark text"
                  className="h-7 text-xs"
                />
              </Field>

              <Field label="Position">
                <SegmentedControl
                  value={position}
                  onChange={(next) => {
                    setPosition(next)
                    invalidateResult()
                  }}
                  options={[
                    { label: 'Tiled', value: 'tiled' },
                    { label: 'Center', value: 'center' },
                  ]}
                />
              </Field>

              <Field label="Opacity" layout="row">
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={opacity}
                  onChange={(event) => {
                    setOpacity(Number(event.target.value))
                    invalidateResult()
                  }}
                  aria-label="Watermark opacity"
                  className="h-1 min-w-16 flex-1 accent-primary"
                />
                <span className="w-8 shrink-0 text-right font-mono tabular-nums">{opacity}</span>
              </Field>

              <Field label="Size" layout="row">
                <input
                  type="range"
                  min={12}
                  max={120}
                  value={fontSize}
                  onChange={(event) => {
                    setFontSize(Number(event.target.value))
                    invalidateResult()
                  }}
                  aria-label="Watermark text size"
                  className="h-1 min-w-16 flex-1 accent-primary"
                />
                <span className="w-8 shrink-0 text-right font-mono tabular-nums">{fontSize}</span>
              </Field>

              <Field label="Color" htmlFor={`${instanceId}-color`}>
                <Input
                  id={`${instanceId}-color`}
                  type="color"
                  value={color}
                  onChange={(event) => {
                    setColor(event.target.value)
                    invalidateResult()
                  }}
                  aria-label="Watermark color"
                  className="h-8 w-14 cursor-pointer p-0"
                />
              </Field>

              {error && <ErrorMessage>{error}</ErrorMessage>}

              <Button type="button" size="sm" onClick={handleApply} disabled={!canApply} className="h-auto gap-1 self-start px-2 py-1">
                {working ? <Loader2 className="size-3.5 animate-spin" /> : <Stamp className="size-3.5" />}
                Add watermark
              </Button>

              {result?.previewUrl && (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
                  <img src={result.previewUrl} alt="Watermarked preview" className="max-h-full max-w-full object-contain" />
                </div>
              )}

              {result && (
                <a href={result.url} download={result.fileName} className={cn(buttonVariants({ size: 'sm' }), 'justify-center')}>
                  <Download className="size-3.5" />
                  Download {result.fileName}
                </a>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

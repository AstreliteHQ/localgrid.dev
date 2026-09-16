import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, ImageUp, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { convertImage, type ConversionResult } from './convertImage'
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

export default function ImageConverterWidget({ instanceId, mode }: WidgetProps) {
  const targets = useMemo(() => listEncodableFormats(), [])
  const [file, setFile] = useWidgetState<File | null>(instanceId, 'file', null)
  const [target, setTarget] = useWidgetState<ImageFormatId>(instanceId, 'target', DEFAULT_TARGET)
  const [quality, setQuality] = useWidgetState(instanceId, 'quality', DEFAULT_QUALITY)
  const [detection, setDetection] = useState<Detection | null>(null)
  const [conversion, setConversion] = useState<Conversion | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
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
  }

  const clear = () => {
    publishUrl(null)
    setFile(null)
    setDetection(null)
    setConversion(null)
    if (inputRef.current) inputRef.current.value = ''
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
            dragging && 'border-ring bg-muted/50 text-foreground',
          )}
        >
          <ImageUp className="size-6" />
          <span className="font-medium">Drop an image here</span>
          <span>or click to browse. PNG, JPEG, WebP, GIF, AVIF, HEIC, BMP, TIFF, ICO, SVG.</span>
        </button>
      ) : (
        <>
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs',
              dragging && 'border-ring bg-muted/50',
            )}
          >
            <span className="truncate font-medium" title={file.name}>
              {file.name}
            </span>
            <span
              aria-label="Detected source format"
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
              <a
                href={currentConversion.url}
                download={outputFileName(file.name, targetFormat)}
                className={cn(buttonVariants({ size: 'sm' }), 'ml-auto shrink-0')}
              >
                <Download />
                Download
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}

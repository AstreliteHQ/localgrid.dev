import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { nanoid } from 'nanoid'
import { AlertTriangle, Check, Clipboard, ClipboardPaste, Download, FolderOpen, ImageUp, Trash2, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { isFileDrag } from '@/components/codeEditorFileDrop'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { toPngBlob } from '@/widgets/image-converter/convertImage'
import { formatFileSize } from '@/widgets/image-converter/imageFormats'
import { imageLabel, pickImageFiles, type BufferImage } from './bufferImages'

const DEFAULT_IMAGES: BufferImage[] = []
const DEFAULT_SELECTED: string | null = null

type CopyStatus = 'idle' | 'copied' | 'failed'

/** One object URL per image, recreated when the image list changes and
 * revoked on the way out. Same create/revoke pairing ImageConverterWidget
 * uses for its single result, just for the whole list at once. */
function useObjectUrls(images: BufferImage[]): Map<string, string> {
  const urls = useMemo(() => new Map(images.map((image) => [image.id, URL.createObjectURL(image.file)])), [images])

  useEffect(() => {
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [urls])

  return urls
}

/** A scratch pad for images, kept apart from the Notes widget: paste a
 * screenshot, drop a few files, keep them at hand while working in other
 * widgets, then copy or download whichever one is needed. Images are held as
 * `File` objects in the widget's own in-memory state, like the single file in
 * ImageConverterWidget, so nothing is encoded or persisted past the session. */
export default function ImageBufferWidget({ instanceId, mode }: WidgetProps) {
  const [images, setImages] = useWidgetState<BufferImage[]>(instanceId, 'images', DEFAULT_IMAGES)
  const [selectedId, setSelectedId] = useWidgetState<string | null>(instanceId, 'selectedId', DEFAULT_SELECTED)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const urls = useObjectUrls(images)

  useWidgetDirty(instanceId, images.length > 0)
  useEffect(() => () => clearTimeout(copyStatusTimeoutRef.current), [])

  // A stale or missing selection falls back to the newest image, so removing
  // the selected one (or never having picked one) needs no extra bookkeeping.
  const selected = images.find((image) => image.id === selectedId) ?? images.at(-1) ?? null
  const selectedUrl = selected ? urls.get(selected.id) : undefined

  const addFiles = (files: FileList | File[]) => {
    const { images: picked, errors } = pickImageFiles(files, () => nanoid(8))
    setError(errors.length > 0 ? errors.join(' ') : null)
    if (picked.length === 0) return
    setImages((previous) => [...previous, ...picked])
    setSelectedId(picked[picked.length - 1].id)
  }

  const removeImage = (id: string) => {
    setImages((previous) => previous.filter((image) => image.id !== id))
    setError(null)
  }

  const clearAll = () => {
    setImages([])
    setSelectedId(DEFAULT_SELECTED)
    setError(null)
  }

  // A native `paste` only reaches the focused element, so the root takes it
  // from anything focused inside the widget. Only intercepted when the
  // clipboard carries image files; anything else is left alone.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving between the zone's own children fires dragleave too; only a
    // leave of the zone itself should clear the highlight.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const handleCopy = async () => {
    if (selected && typeof ClipboardItem !== 'undefined') {
      try {
        // Browsers only reliably accept an `image/png` ClipboardItem, so any
        // other format is re-encoded first. The promise is passed straight
        // to ClipboardItem rather than awaited: Safari only allows the write
        // while still inside the click's own call stack.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob(selected.file) })])
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

  return (
    <div
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex h-full flex-col gap-2 text-xs"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="Choose image files"
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {/* Not a <button>: the area is both the drop target and the focus
       * target a paste needs, and only the Browse button inside it should
       * open the OS file picker. */}
      <div
        role="group"
        aria-label="Image drop zone. Click here, then paste with Ctrl or Cmd+V, or drag and drop files."
        tabIndex={0}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50',
          images.length === 0 ? 'flex-1 flex-col justify-center p-4 text-center' : 'px-2 py-1.5',
          dragging && 'border-ring bg-muted/50 text-foreground',
        )}
      >
        {images.length === 0 ? (
          <>
            <ImageUp className="size-6" aria-hidden="true" />
            <span className="font-medium">Drop images here</span>
            <span>Click, then paste with Ctrl/Cmd+V</span>
          </>
        ) : (
          <>
            <ClipboardPaste className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Paste or drop</span>
          </>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className={cn('h-auto gap-1 px-2 py-1 text-xs', images.length > 0 && 'ml-auto shrink-0')}
        >
          <FolderOpen className="size-3.5" />
          Browse
        </Button>
      </div>

      {images.length > 0 && (
        <div className="flex max-h-24 shrink-0 flex-wrap gap-1.5 overflow-y-auto" aria-label="Buffered images">
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelectedId(image.id)}
              aria-pressed={image.id === selected?.id}
              title={imageLabel(image.file)}
              className={cn(
                'size-10 shrink-0 overflow-hidden rounded border bg-muted/30 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/50',
                image.id === selected?.id ? 'border-ring' : 'border-border hover:border-ring/60',
              )}
            >
              {urls.get(image.id) && (
                <img src={urls.get(image.id)} alt={imageLabel(image.file)} className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div
            className={cn(
              'flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2',
              mode === 'overlay' && 'p-4',
            )}
          >
            {selectedUrl && (
              <img
                src={selectedUrl}
                alt={`${imageLabel(selected.file)} preview`}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="truncate" title={imageLabel(selected.file)}>
              {imageLabel(selected.file)}
            </span>
            <span className="ml-auto shrink-0">{formatFileSize(selected.file.size)}</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
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
            {selectedUrl && (
              <a
                href={selectedUrl}
                download={selected.file.name || undefined}
                aria-label={`Download ${imageLabel(selected.file)}`}
                className={buttonVariants({ size: 'sm' })}
              >
                <Download />
                Download
              </a>
            )}
            <div className="ml-auto flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => removeImage(selected.id)}
                aria-label={`Remove ${imageLabel(selected.file)}`}
                title={`Remove ${imageLabel(selected.file)}`}
                className="text-muted-foreground"
              >
                <X />
              </Button>
              {images.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={clearAll}
                  aria-label={`Clear all (${images.length})`}
                  title={`Clear all (${images.length})`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  )
}

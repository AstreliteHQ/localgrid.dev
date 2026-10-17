import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { nanoid } from 'nanoid'
import { ImagePlus, X } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ErrorMessage } from '@/components/ErrorMessage'
import { isFileDrag } from '@/components/codeEditorFileDrop'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { computeTextStatistics, estimateReadingTimeMinutes } from './computeTextStatistics'
import { pickImageFiles, type NoteImage } from './noteImages'

const DEFAULT_CONTENT = ''
const DEFAULT_IMAGES: NoteImage[] = []

/** Free-form plain text notes, edited with the app's own CodeEditor (no
 * language grammar — just line numbers, search, and wrapping), an image
 * attachment strip below it, and a collapsible statistics panel at the
 * bottom mirroring StatisticsCalculatorWidget's label/value rows. */
export default function NotesWidget({ instanceId }: WidgetProps) {
  const [content, setContent] = useWidgetState(instanceId, 'content', DEFAULT_CONTENT)
  const [images, setImages] = useWidgetState<NoteImage[]>(instanceId, 'images', DEFAULT_IMAGES)
  // Persisted per-instance like JsonFormatterWidget's viewMode — the panel
  // stays open or closed exactly how the user last left it, and doesn't
  // count toward the widget's dirty state below (same as that viewMode).
  const [statsOpen, setStatsOpen] = useWidgetState(instanceId, 'statsOpen', false)
  const [attachError, setAttachError] = useState<string | null>(null)
  useWidgetDirty(instanceId, content !== DEFAULT_CONTENT || images.length > 0)

  const stats = useMemo(() => computeTextStatistics(content), [content])
  const readingTime = estimateReadingTimeMinutes(stats.words)

  const addFiles = (files: FileList | File[]) => {
    const { images: picked, errors } = pickImageFiles(files, () => nanoid(8))
    setAttachError(errors.length > 0 ? errors.join(' ') : null)
    if (picked.length > 0) setImages((previous) => [...previous, ...picked])
  }

  const removeImage = (id: string) => {
    setImages((previous) => previous.filter((image) => image.id !== id))
  }

  // Attached at the top level (not on the editor itself) so it still
  // catches a screenshot pasted while the CodeMirror editor has focus —
  // paste bubbles up through it same as any other DOM event. Only
  // intercepted when the clipboard actually carries image files, so a
  // normal text paste into the editor is completely unaffected.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs" onPaste={handlePaste}>
      <CodeEditor
        value={content}
        onChange={setContent}
        language="plaintext"
        placeholder="Write something…"
        aria-label="Notes"
        className="min-h-0 flex-1"
      />

      <ImageAttachments images={images} onAddFiles={addFiles} onRemove={removeImage} error={attachError} />

      <Collapsible
        open={statsOpen}
        onOpenChange={setStatsOpen}
        className="shrink-0 rounded-md border border-border bg-background px-2 py-1.5 dark:bg-muted/40"
      >
        <CollapsibleTrigger>
          <span className="font-medium">Statistics</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-2 font-mono text-[11px] sm:grid-cols-3">
            <StatItem label="Characters" value={stats.characters} />
            <StatItem label="No spaces" value={stats.charactersNoSpaces} />
            <StatItem label="Words" value={stats.words} />
            <StatItem label="Lines" value={stats.lines} />
            <StatItem label="Paragraphs" value={stats.paragraphs} />
            <StatItem label="Sentences" value={stats.sentences} />
            <StatItem label="Reading time" value={`${readingTime} min`} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

/** Each attached image gets its own object URL for display, recreated
 * whenever the image list changes and revoked on the way out — mirrors
 * ImageConverterWidget's own create/revoke-the-previous-one pattern, just
 * for a whole list at once instead of a single result. */
function useObjectUrls(images: NoteImage[]): Map<string, string> {
  const urls = useMemo(() => new Map(images.map((image) => [image.id, URL.createObjectURL(image.file)])), [images])

  useEffect(() => {
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [urls])

  return urls
}

function ImageAttachments({
  images,
  onAddFiles,
  onRemove,
  error,
}: {
  images: NoteImage[]
  onAddFiles: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  error: string | null
}) {
  const [dropActive, setDropActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urls = useObjectUrls(images)

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!dropActive) setDropActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDropActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    setDropActive(false)
    onAddFiles(event.dataTransfer.files)
  }

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label="Image attachments"
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border p-1.5',
          dropActive && 'border-ring bg-muted/40',
        )}
      >
        {images.map((image) => (
          <ImageThumb key={image.id} image={image} url={urls.get(image.id)} onRemove={() => onRemove(image.id)} />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="Add image"
          title="Add image"
          className="flex size-9 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
        >
          <ImagePlus className="size-3.5" aria-hidden="true" />
        </button>
        {images.length === 0 && (
          <span className="text-muted-foreground">Drop images here, paste a screenshot, or click +</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="Choose image files"
        className="hidden"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) onAddFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  )
}

function ImageThumb({ image, url, onRemove }: { image: NoteImage; url: string | undefined; onRemove: () => void }) {
  return (
    <div className="group relative size-9 shrink-0 overflow-hidden rounded border border-border bg-muted/30">
      {url && (
        <a href={url} target="_blank" rel="noreferrer" title={`Open ${image.file.name}`}>
          <img src={url} alt={image.file.name} className="size-full object-cover" />
        </a>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onRemove()
        }}
        aria-label={`Remove ${image.file.name}`}
        title={`Remove ${image.file.name}`}
        className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-background/90 py-px text-destructive opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  )
}

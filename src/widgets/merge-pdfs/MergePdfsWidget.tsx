import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, FileStack, FileWarning, FolderOpen, Loader2, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { countPages, mergePdfs, sanitizeFileName } from './mergePdfs'

interface FileEntry {
  id: string
  file: File
}

/** Per-file page count (or the reason it can't be read), keyed by the
 * entry's own id rather than the file itself — not persisted in widget
 * state, since it's cheap to recompute and would otherwise need its own
 * cache-invalidation story. */
interface Detection {
  pageCount: number | null
  error: string | null
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

const DEFAULT_OUTPUT_NAME = 'merged'

export default function MergePdfsWidget({ instanceId }: WidgetProps) {
  const [entries, setEntries] = useWidgetState<FileEntry[]>(instanceId, 'entries', [])
  const [outputName, setOutputName] = useWidgetState(instanceId, 'outputName', DEFAULT_OUTPUT_NAME)
  const [detections, setDetections] = useState<Record<string, Detection>>({})
  const [dragging, setDragging] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; pageCount: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Mirrors the currently published object URL so the previous one can be
  // revoked the moment it's replaced or no longer applies.
  const urlRef = useRef<string | null>(null)

  useWidgetDirty(instanceId, entries.length > 0 || outputName !== DEFAULT_OUTPUT_NAME)

  const publishUrl = (url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
  }

  useEffect(() => () => publishUrl(null), [])

  // Reads each newly-added file's page count in the background — same
  // "detect before offering the real action" shape as ImageConverterWidget,
  // just per-file instead of for a single file.
  useEffect(() => {
    const pending = entries.filter((entry) => !(entry.id in detections))
    if (pending.length === 0) return
    let cancelled = false
    for (const entry of pending) {
      countPages(entry.file)
        .then((pageCount) => {
          if (cancelled) return
          setDetections((prev) => ({ ...prev, [entry.id]: { pageCount, error: null } }))
        })
        .catch(() => {
          if (cancelled) return
          setDetections((prev) => ({
            ...prev,
            [entry.id]: { pageCount: null, error: `"${entry.file.name}" isn't a readable PDF.` },
          }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [entries, detections])

  const invalidatePreviousResult = () => {
    publishUrl(null)
    setResult(null)
    setMergeError(null)
  }

  const addFiles = (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return
    const added = Array.from(files).map((file) => ({ id: nanoid(8), file }))
    setEntries((prev) => [...prev, ...added])
    invalidatePreviousResult()
  }

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
    setDetections((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    invalidatePreviousResult()
  }

  const moveEntry = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= entries.length) return
    setEntries((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    invalidatePreviousResult()
  }

  const clearAll = () => {
    setEntries([])
    setDetections({})
    invalidatePreviousResult()
    if (inputRef.current) inputRef.current.value = ''
  }

  const allDetected = entries.every((entry) => entry.id in detections)
  const hasInvalidFile = entries.some((entry) => detections[entry.id]?.error)
  const canMerge = entries.length >= 2 && allDetected && !hasInvalidFile && !merging
  const outputFileName = `${sanitizeFileName(outputName, DEFAULT_OUTPUT_NAME)}.pdf`

  const handleMerge = async () => {
    setMerging(true)
    setMergeError(null)
    try {
      const merged = await mergePdfs(entries.map((entry) => entry.file))
      const blob = new Blob([new Uint8Array(merged.bytes)], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      publishUrl(url)
      setResult({ url, pageCount: merged.pageCount })
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Could not merge these files.')
    } finally {
      setMerging(false)
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
        addFiles(event.dataTransfer?.files)
      }}
      className="flex h-full flex-col gap-2 text-xs"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        aria-label="PDF files"
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {entries.length === 0 ? (
        <div
          role="group"
          aria-label="PDF drop zone"
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
            dragging && 'border-ring bg-muted/50 text-foreground',
          )}
        >
          <FileStack className="size-6" />
          <span className="font-medium">Drop PDFs here</span>
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
          <span>Add two or more, in the order you want them joined.</span>
        </div>
      ) : (
        <>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {entries.map((entry, index) => {
              const detection = detections[entry.id]
              return (
                <li key={entry.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="w-4 shrink-0 text-right text-muted-foreground">{index + 1}</span>
                  <span className="truncate font-medium" title={entry.file.name}>
                    {entry.file.name}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {!detection ? (
                      'Reading…'
                    ) : detection.error ? (
                      <FileWarning
                        role="img"
                        aria-label={detection.error}
                        className="size-3.5 text-destructive"
                      />
                    ) : (
                      `${detection.pageCount} pg`
                    )}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatFileSize(entry.file.size)}</span>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => moveEntry(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${entry.file.name} up`}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => moveEntry(index, 1)}
                      disabled={index === entries.length - 1}
                      aria-label={`Move ${entry.file.name} down`}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeEntry(entry.id)}
                      aria-label={`Remove ${entry.file.name}`}
                      className="text-muted-foreground"
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          {hasInvalidFile && (
            <ErrorMessage>Remove the file(s) marked above — they aren't readable PDFs.</ErrorMessage>
          )}
          {mergeError && <ErrorMessage>{mergeError}</ErrorMessage>}
          {!hasInvalidFile && entries.length === 1 && (
            <p className="text-muted-foreground">Add one more PDF to merge.</p>
          )}

          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">Save as</span>
            <Input
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              placeholder={DEFAULT_OUTPUT_NAME}
              aria-label="Output file name"
              className="h-7 flex-1 text-xs"
            />
            <span className="shrink-0 text-muted-foreground">.pdf</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              className="h-auto gap-1 px-2 py-1"
            >
              <FolderOpen className="size-3.5" />
              Add more
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} className="h-auto px-2 py-1 text-muted-foreground">
              Clear all
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleMerge}
              disabled={!canMerge}
              className="ml-auto h-auto gap-1 px-2 py-1"
            >
              {merging ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Merge {entries.length} file{entries.length === 1 ? '' : 's'}
            </Button>
          </div>

          {result && (
            <a href={result.url} download={outputFileName} className={cn(buttonVariants({ size: 'sm' }), 'justify-center')}>
              <Download className="size-3.5" />
              Download {outputFileName} ({result.pageCount} pages)
            </a>
          )}
        </>
      )}
    </div>
  )
}

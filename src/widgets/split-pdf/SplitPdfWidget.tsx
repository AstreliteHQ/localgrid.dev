import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Loader2, Scissors, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { countPages, everyPageRanges, parsePageRanges, splitPdf, type SplitPart } from './splitPdf'

type Mode = 'every-page' | 'custom'

const DEFAULT_MODE: Mode = 'every-page'
const DEFAULT_RANGES_INPUT = ''

interface Detection {
  file: File
  pageCount: number | null
  error: string | null
}

interface PublishedPart {
  label: string
  pageCount: number
  url: string
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

export default function SplitPdfWidget({ instanceId }: WidgetProps) {
  const [file, setFile] = useWidgetState<File | null>(instanceId, 'file', null)
  const [mode, setMode] = useWidgetState<Mode>(instanceId, 'mode', DEFAULT_MODE)
  const [rangesInput, setRangesInput] = useWidgetState(instanceId, 'rangesInput', DEFAULT_RANGES_INPUT)
  const [detection, setDetection] = useState<Detection | null>(null)
  const [dragging, setDragging] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [splitError, setSplitError] = useState<string | null>(null)
  const [parts, setParts] = useState<PublishedPart[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Every part's object URL currently alive, so they can all be revoked at
  // once the moment a newer split (or a cleared/replaced file) replaces
  // them.
  const urlsRef = useRef<string[]>([])

  useWidgetDirty(instanceId, file !== null || mode !== DEFAULT_MODE || rangesInput !== DEFAULT_RANGES_INPUT)

  const publishUrls = (urls: string[]) => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url)
    urlsRef.current = urls
  }

  useEffect(() => () => publishUrls([]), [])

  useEffect(() => {
    if (!file) return
    let cancelled = false
    countPages(file)
      .then((pageCount) => {
        if (cancelled) return
        setDetection({ file, pageCount, error: null })
      })
      .catch(() => {
        if (cancelled) return
        setDetection({ file, pageCount: null, error: `"${file.name}" isn't a readable PDF.` })
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const currentDetection = detection && detection.file === file ? detection : null
  const pageCount = currentDetection?.pageCount ?? null

  const invalidateResult = () => {
    publishUrls([])
    setParts(null)
    setSplitError(null)
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

  const parsedRanges = mode === 'custom' && pageCount !== null ? parsePageRanges(rangesInput, pageCount) : null
  const canSplit = pageCount !== null && !splitting && (mode === 'every-page' ? pageCount > 0 : !!parsedRanges?.ranges.length)

  const handleSplit = async () => {
    if (!file || pageCount === null) return
    const ranges = mode === 'every-page' ? everyPageRanges(pageCount) : (parsedRanges?.ranges ?? [])
    if (ranges.length === 0) return
    setSplitting(true)
    setSplitError(null)
    try {
      const split: SplitPart[] = await splitPdf(file, ranges)
      const urls = split.map((part) => URL.createObjectURL(new Blob([new Uint8Array(part.bytes)], { type: 'application/pdf' })))
      publishUrls(urls)
      setParts(split.map((part, index) => ({ label: part.label, pageCount: part.pageCount, url: urls[index] })))
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : 'Could not split this PDF.')
    } finally {
      setSplitting(false)
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
      className="flex h-full flex-col gap-2 text-xs"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="PDF file"
        onChange={(event) => {
          accept(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      {!file ? (
        <div
          role="group"
          aria-label="PDF drop zone"
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
            dragging && 'border-ring bg-muted/50 text-foreground',
          )}
        >
          <Scissors className="size-6" />
          <span className="font-medium">Drop a PDF here</span>
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
              {!currentDetection ? 'Reading…' : currentDetection.error ? null : `${pageCount} pg`}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
            <Button type="button" variant="ghost" size="icon-xs" onClick={clear} aria-label="Remove file" className="shrink-0 text-muted-foreground">
              <X />
            </Button>
          </div>

          {currentDetection?.error && <ErrorMessage>{currentDetection.error}</ErrorMessage>}

          {pageCount !== null && (
            <>
              <SegmentedControl
                value={mode}
                onChange={(next) => {
                  setMode(next)
                  invalidateResult()
                }}
                options={[
                  { label: 'Every page', value: 'every-page' },
                  { label: 'Custom ranges', value: 'custom' },
                ]}
              />

              {mode === 'custom' && (
                <Field htmlFor={`${instanceId}-ranges`} error={rangesInput.trim() ? parsedRanges?.error : null}>
                  <Input
                    id={`${instanceId}-ranges`}
                    value={rangesInput}
                    onChange={(event) => {
                      setRangesInput(event.target.value)
                      invalidateResult()
                    }}
                    placeholder={`e.g. 1-3, 5, 7-${pageCount}`}
                    className="h-7 text-xs"
                  />
                </Field>
              )}

              {splitError && <ErrorMessage>{splitError}</ErrorMessage>}

              <Button type="button" size="sm" onClick={handleSplit} disabled={!canSplit} className="h-auto gap-1 self-start px-2 py-1">
                {splitting ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
                Split
              </Button>

              {parts && (
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {parts.map((part) => (
                    <li key={part.label} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <span className="truncate font-medium">{part.label}.pdf</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        {part.pageCount} pg{part.pageCount === 1 ? '' : 's'}
                      </span>
                      <a href={part.url} download={`${part.label}.pdf`} className={cn(buttonVariants({ size: 'icon-xs', variant: 'ghost' }))} aria-label={`Download ${part.label}.pdf`}>
                        <Download />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

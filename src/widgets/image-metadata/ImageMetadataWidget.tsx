import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
} from 'react'
import { ClipboardPaste, Download, FolderOpen, ImageUp, MapPin, RotateCcw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ErrorMessage } from '@/components/ErrorMessage'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { formatFileSize } from '@/widgets/image-converter/imageFormats'
import { CONTAINER_LABELS } from './containers'
import {
  applyMetadataEdits,
  hasEdits,
  NO_EDITS,
  readImageMetadata,
  SECTION_LABELS,
  type ImageMetadata,
  type MetadataEdits,
  type MetadataField,
  type MetadataSection,
} from './metadata'

const SECTIONS: MetadataSection[] = ['exif', 'iptc', 'xmp']

/** The decoded file, tagged with the file it came from so a stale read is
 * never shown next to a newer drop. */
interface Loaded {
  file: File
  bytes: Uint8Array | null
  metadata: ImageMetadata | null
  previewUrl: string | null
  error: string | null
}

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

function matches(field: MetadataField, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return [field.name, field.value, field.group].some((text) => text.toLowerCase().includes(needle))
}

function formatCoordinate(value: number): string {
  return value.toFixed(5)
}

interface FieldRowProps {
  field: MetadataField
  value: string | undefined
  removed: boolean
  error: string | null
  wide: boolean
  onChange: (text: string) => void
  onRemove: () => void
  onRestore: () => void
}

function FieldRow({ field, value, removed, error, wide, onChange, onRemove, onRestore }: FieldRowProps) {
  const edited = value !== undefined
  return (
    <li
      className={cn(
        'grid items-start gap-x-2 py-0.5',
        wide ? 'grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto]',
      )}
    >
      <span
        title={field.name}
        className={cn(
          'truncate pt-1 font-mono text-[11px] text-muted-foreground',
          removed && 'line-through opacity-60',
          edited && 'text-primary',
        )}
      >
        {field.name}
      </span>
      <div className="min-w-0">
        {field.editable && !removed ? (
          <Input
            value={value ?? field.value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={field.name}
            aria-invalid={error ? true : undefined}
            className={cn('h-6 px-1.5 text-xs md:text-xs', edited && !error && 'border-primary/50')}
          />
        ) : (
          <span
            title={field.value}
            className={cn(
              'block truncate py-1 text-xs',
              removed ? 'text-muted-foreground line-through' : 'text-foreground/80',
            )}
          >
            {field.value || <span className="text-muted-foreground italic">empty</span>}
          </span>
        )}
        {error && !removed && <ErrorMessage>{error}</ErrorMessage>}
        {field.hint && !edited && !removed && (
          <span className="block text-[10px] text-muted-foreground">{field.hint}</span>
        )}
      </div>
      <div className="flex items-center">
        {(edited || removed) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRestore}
            aria-label={`Restore ${field.name}`}
            title="Restore the original value"
            className="text-muted-foreground"
          >
            <RotateCcw />
          </Button>
        )}
        {!removed && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label={`Remove ${field.name}`}
            title="Strip this field"
            className="text-muted-foreground hover:text-destructive"
          >
            <X />
          </Button>
        )}
      </div>
    </li>
  )
}

export default function ImageMetadataWidget({ instanceId, mode }: WidgetProps) {
  const [file, setFile] = useWidgetState<File | null>(instanceId, 'file', null)
  const [edits, setEdits] = useWidgetState<MetadataEdits>(instanceId, 'edits', NO_EDITS)
  const [query, setQuery] = useWidgetState(instanceId, 'query', '')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<string | null>(null)

  useWidgetDirty(instanceId, file !== null)

  const current = loaded && loaded.file === file ? loaded : null
  const metadata = current?.metadata ?? null

  const publishUrl = useCallback((url: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
  }, [])

  useEffect(() => () => publishUrl(null), [publishUrl])

  useEffect(() => {
    if (!file) return
    let cancelled = false
    file
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) return
        const bytes = new Uint8Array(buffer)
        try {
          const read = readImageMetadata(bytes)
          const previewUrl = URL.createObjectURL(file)
          publishUrl(previewUrl)
          setLoaded({ file, bytes, metadata: read, previewUrl, error: null })
        } catch (cause) {
          publishUrl(null)
          const error = cause instanceof Error ? cause.message : 'This image could not be read.'
          setLoaded({ file, bytes, metadata: null, previewUrl: null, error })
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoaded({ file, bytes: null, metadata: null, previewUrl: null, error: 'That file could not be read.' })
      })
    return () => {
      cancelled = true
    }
  }, [file, publishUrl])

  const removed = useMemo(() => new Set(edits.removed), [edits.removed])

  const fieldErrors = useMemo(() => {
    const errors = new Map<string, string>()
    if (!metadata) return errors
    for (const field of metadata.fields) {
      const value = edits.values[field.id]
      if (value === undefined || removed.has(field.id)) continue
      const error = field.validate?.(value)
      if (error) errors.set(field.id, error)
    }
    return errors
  }, [metadata, edits.values, removed])

  // Rewriting the file copies all of its bytes, so it trails typing a little
  // instead of running on every keystroke.
  const deferredEdits = useDeferredValue(edits)
  const deferredInvalid = useDeferredValue(fieldErrors.size > 0)
  const output = useMemo(() => {
    if (!current?.bytes || !metadata || deferredInvalid) return null
    try {
      return { bytes: applyMetadataEdits(current.bytes, deferredEdits), error: null }
    } catch (cause) {
      return { bytes: null, error: cause instanceof Error ? cause.message : 'Could not write the metadata.' }
    }
  }, [current, metadata, deferredEdits, deferredInvalid])

  const accept = (next: File | null | undefined) => {
    if (!next) return
    publishUrl(null)
    setLoaded(null)
    setEdits(NO_EDITS)
    setFile(next)
    if (!file) setPasteZoneFocused(false)
  }

  const clear = () => {
    publishUrl(null)
    setFile(null)
    setLoaded(null)
    setEdits(NO_EDITS)
    setQuery('')
    setPasteZoneFocused(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    // Pasting text into a field input must keep working as usual.
    if (event.target instanceof HTMLInputElement) return
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

  const setFieldValue = (field: MetadataField, text: string) => {
    const values = { ...edits.values }
    if (text === field.value) delete values[field.id]
    else values[field.id] = text
    setEdits({ ...edits, values })
  }

  const removeFields = (ids: string[]) => {
    setEdits({ ...edits, removed: [...new Set([...edits.removed, ...ids])] })
  }

  const restoreFields = (ids: string[]) => {
    const restoring = new Set(ids)
    const values = Object.fromEntries(Object.entries(edits.values).filter(([id]) => !restoring.has(id)))
    setEdits({ values, removed: edits.removed.filter((id) => !restoring.has(id)) })
  }

  const handleDownload = () => {
    if (!output?.bytes || !file) return
    const url = URL.createObjectURL(new Blob([output.bytes as Uint8Array<ArrayBuffer>], { type: file.type }))
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const fields = metadata?.fields ?? []
  const gpsIds = fields.filter((field) => field.gps).map((field) => field.id)
  const gpsLeft = gpsIds.some((id) => !removed.has(id))
  const visible = fields.filter((field) => matches(field, query))
  const editedCount = Object.keys(edits.values).filter((id) => !removed.has(id)).length
  const removedCount = edits.removed.length
  const blocked = fieldErrors.size > 0 || !output?.bytes

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
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        aria-label="Image file"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {!file ? (
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
            {pasteZoneFocused ? 'Ready to paste' : 'Click, then paste with Ctrl/Cmd+V'}
          </span>
          <span>EXIF, IPTC and XMP from JPEG, PNG and WebP. Nothing leaves your browser.</span>
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
            {current?.previewUrl && (
              <img
                src={current.previewUrl}
                alt=""
                className={cn('shrink-0 rounded object-cover', mode === 'overlay' ? 'size-12' : 'size-6')}
              />
            )}
            <span className="truncate font-medium" title={file.name}>
              {file.name}
            </span>
            {metadata && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                {CONTAINER_LABELS[metadata.format]}
              </span>
            )}
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

          {!current && (
            <p role="status" className="text-xs text-muted-foreground">
              Reading metadata…
            </p>
          )}
          {current?.error && <ErrorMessage>{current.error}</ErrorMessage>}
          {metadata?.errors.map((error) => (
            <ErrorMessage key={error}>Could not decode {error} It is kept as it is.</ErrorMessage>
          ))}

          {metadata && fields.length === 0 && (
            <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No EXIF, IPTC or XMP metadata in this image.
            </p>
          )}

          {metadata && fields.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter fields"
                    aria-label="Filter fields"
                    className="h-7 pl-7 text-xs md:text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeFields(fields.map((field) => field.id))}
                  disabled={fields.every((field) => removed.has(field.id))}
                >
                  Strip all
                </Button>
              </div>

              {gpsIds.length > 0 && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs',
                    gpsLeft ? 'border-destructive/30 bg-destructive/5' : 'border-border text-muted-foreground',
                  )}
                >
                  <MapPin className={cn('size-3.5 shrink-0', gpsLeft && 'text-destructive')} />
                  <span className="min-w-0 flex-1 truncate">
                    {gpsLeft
                      ? metadata.gps
                        ? `Location: ${formatCoordinate(metadata.gps.latitude)}, ${formatCoordinate(metadata.gps.longitude)}`
                        : 'Contains location data'
                      : 'Location data will be removed'}
                  </span>
                  {gpsLeft ? (
                    <Button type="button" variant="destructive" size="xs" onClick={() => removeFields(gpsIds)}>
                      Strip GPS
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" size="xs" onClick={() => restoreFields(gpsIds)}>
                      Undo
                    </Button>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {SECTIONS.map((section) => {
                  const sectionFields = visible.filter((field) => field.section === section)
                  if (sectionFields.length === 0) return null
                  const allIds = fields.filter((field) => field.section === section).map((field) => field.id)
                  const allRemoved = allIds.every((id) => removed.has(id))
                  const groups = [...new Set(sectionFields.map((field) => field.group))]
                  return (
                    <section key={section} aria-label={`${SECTION_LABELS[section]} fields`} className="mb-2">
                      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card py-1">
                        <h3 className="text-xs font-semibold">{SECTION_LABELS[section]}</h3>
                        <span className="text-[11px] text-muted-foreground">{allIds.length}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => (allRemoved ? restoreFields(allIds) : removeFields(allIds))}
                          className="ml-auto text-muted-foreground"
                        >
                          {allRemoved ? 'Restore' : `Strip ${SECTION_LABELS[section]}`}
                        </Button>
                      </header>
                      {groups.map((group) => (
                        <div key={group} className="mt-1">
                          {groups.length > 1 && (
                            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              {group}
                            </p>
                          )}
                          <ul>
                            {sectionFields
                              .filter((field) => field.group === group)
                              .map((field) => (
                                <FieldRow
                                  key={field.id}
                                  field={field}
                                  value={edits.values[field.id]}
                                  removed={removed.has(field.id)}
                                  error={fieldErrors.get(field.id) ?? null}
                                  wide={mode === 'overlay'}
                                  onChange={(text) => setFieldValue(field, text)}
                                  onRemove={() => removeFields([field.id])}
                                  onRestore={() => restoreFields([field.id])}
                                />
                              ))}
                          </ul>
                        </div>
                      ))}
                    </section>
                  )
                })}
                {visible.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No field matches "{query}".</p>
                )}
              </div>

              {output?.error && <ErrorMessage>{output.error}</ErrorMessage>}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate" aria-live="polite">
                  {hasEdits(edits)
                    ? [editedCount > 0 && `${editedCount} edited`, removedCount > 0 && `${removedCount} removed`]
                        .filter(Boolean)
                        .join(', ')
                    : 'No changes'}
                  {output?.bytes && hasEdits(edits) && ` · ${formatFileSize(output.bytes.length)}`}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {hasEdits(edits) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEdits(NO_EDITS)}
                      className="text-muted-foreground"
                    >
                      Reset
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={handleDownload} disabled={blocked}>
                    <Download />
                    Download
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

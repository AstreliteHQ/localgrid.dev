import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, Check, Download, ImageIcon } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { NumberInput } from '@/components/NumberField'
import { PageColorPicker } from '@/components/PageColorPicker'
import { ScreenColorPicker } from '@/components/ScreenColorPicker'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  MAX_SIZE,
  MAX_STROKE,
  MIN_SIZE,
  MIN_STROKE,
  buildIconSvg,
  clampPadding,
  iconFileName,
  searchIcons,
  toKebabName,
  type IconStyle,
} from './iconSvg'
import { copyPngToClipboard, downloadBlob, svgToPngBlob } from './svgExport'

type Catalog = typeof import('./iconCatalog')
type PngScale = '1' | '2' | '4'

export const DEFAULT_ICON = 'Sparkles'
export const DEFAULT_COLOR = '#000000'
export const DEFAULT_STROKE = 2
export const DEFAULT_SIZE = 64
export const DEFAULT_PADDING = 0
export const DEFAULT_PNG_SCALE: PngScale = '2'

const PNG_SCALE_OPTIONS: { label: string; value: PngScale }[] = [
  { label: '1x', value: '1' },
  { label: '2x', value: '2' },
  { label: '4x', value: '4' },
]

/** Grid cell edge, in px. */
const CELL = 36
/** Rows rendered above and below the visible ones. */
const OVERSCAN = 2

/** Light checkerboard behind the preview whatever the theme, so both a
 * black and a white icon stay visible and transparency reads as such. */
const PREVIEW_BACKGROUND = 'repeating-conic-gradient(#e4e4e7 0 25%, #ffffff 0 50%) 0 0 / 12px 12px'

type CatalogState = { status: 'loading' } | { status: 'ready'; catalog: Catalog } | { status: 'failed' }

/** The full icon set lives in its own chunk (see iconCatalog.ts), fetched
 * the first time an Icon Picker mounts. The module cache shares it with
 * every other Icon Picker on the page. */
function useIconCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    import('./iconCatalog')
      .then((catalog) => {
        if (!cancelled) setState({ status: 'ready', catalog })
      })
      .catch(() => {
        // A failed chunk fetch: typically offline after a deploy, before
        // the service worker has cached the new build.
        if (!cancelled) setState({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

export default function IconPickerWidget({ instanceId }: WidgetProps) {
  const [search, setSearch] = useWidgetState(instanceId, 'search', '')
  const [icon, setIcon] = useWidgetState(instanceId, 'icon', DEFAULT_ICON)
  const [color, setColor] = useWidgetState(instanceId, 'color', DEFAULT_COLOR)
  const [strokeWidth, setStrokeWidth] = useWidgetState(instanceId, 'strokeWidth', DEFAULT_STROKE)
  const [size, setSize] = useWidgetState(instanceId, 'size', DEFAULT_SIZE)
  const [padding, setPadding] = useWidgetState(instanceId, 'padding', DEFAULT_PADDING)
  const [pngScale, setPngScale] = useWidgetState<PngScale>(instanceId, 'pngScale', DEFAULT_PNG_SCALE)
  useWidgetDirty(
    instanceId,
    search !== '' ||
      icon !== DEFAULT_ICON ||
      color !== DEFAULT_COLOR ||
      strokeWidth !== DEFAULT_STROKE ||
      size !== DEFAULT_SIZE ||
      padding !== DEFAULT_PADDING ||
      pngScale !== DEFAULT_PNG_SCALE,
  )

  const searchId = useId()
  const catalog = useIconCatalog()

  return (
    <div className="@container flex h-full min-h-0 flex-col gap-2 text-xs">
      <Input
        id={searchId}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search icons…"
        aria-label="Search icons"
        spellCheck={false}
        className="h-8 shrink-0 text-xs md:text-xs"
      />
      {catalog.status === 'ready' ? (
        <IconPickerBody
          catalog={catalog.catalog}
          search={search}
          icon={icon}
          onIconChange={setIcon}
          style={{ color, strokeWidth, size, padding }}
          onColorChange={setColor}
          onStrokeWidthChange={setStrokeWidth}
          onSizeChange={setSize}
          onPaddingChange={setPadding}
          pngScale={pngScale}
          onPngScaleChange={setPngScale}
        />
      ) : catalog.status === 'loading' ? (
        <p className="flex flex-1 items-center justify-center text-muted-foreground">Loading icons…</p>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <ErrorMessage>Could not load the icon set. Check your connection and reload.</ErrorMessage>
        </div>
      )}
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Icons by{' '}
        <a href="https://lucide.dev" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Lucide
        </a>{' '}
        (ISC)
      </p>
    </div>
  )
}

interface IconSource {
  key: string
  /** Lucide's own kebab name, read from the rendered icon's class. */
  name: string
  markup: string
  viewBox: string
}

interface IconPickerBodyProps {
  catalog: Catalog
  search: string
  icon: string
  onIconChange: (icon: string) => void
  style: IconStyle
  onColorChange: (color: string) => void
  onStrokeWidthChange: (value: number) => void
  onSizeChange: (value: number) => void
  onPaddingChange: (value: number) => void
  pngScale: PngScale
  onPngScaleChange: (value: PngScale) => void
}

function IconPickerBody({
  catalog: { ICONS, ICON_KEYS },
  search,
  icon,
  onIconChange,
  style,
  onColorChange,
  onStrokeWidthChange,
  onSizeChange,
  onPaddingChange,
  pngScale,
  onPngScaleChange,
}: IconPickerBodyProps) {
  const results = useMemo(() => searchIcons(ICON_KEYS, search), [ICON_KEYS, search])

  // An unknown key (renamed in a later Lucide, or a hand-edited share link)
  // falls back to the default rather than leaving the panel empty.
  const iconKey = ICONS[icon] ? icon : DEFAULT_ICON
  const SelectedIcon = ICONS[iconKey]

  // The export is built from the icon's own elements, read back from a
  // hidden render: lucide-react has no public accessor for an icon's data,
  // and the DOM is the one place it shows up in a form that survives
  // Lucide updates.
  const [source, setSource] = useState<IconSource | null>(null)
  const sourceRef = useCallback(
    (element: SVGSVGElement | null) => {
      if (!element) return
      const name =
        Array.from(element.classList)
          .find((className) => className.startsWith('lucide-'))
          ?.slice('lucide-'.length) ?? toKebabName(iconKey)
      const next: IconSource = {
        key: iconKey,
        name,
        markup: element.innerHTML,
        viewBox: element.getAttribute('viewBox') ?? '0 0 24 24',
      }
      setSource((current) =>
        current?.key === next.key && current.markup === next.markup && current.viewBox === next.viewBox
          ? current
          : next,
      )
    },
    [iconKey],
  )

  const current = source?.key === iconKey ? source : null
  const svg = current ? buildIconSvg(current.markup, style, current.viewBox) : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto @lg:flex-row @lg:overflow-visible">
      <SelectedIcon key={iconKey} ref={sourceRef} className="hidden" aria-hidden="true" />
      <div className="flex min-h-40 min-w-0 flex-1 flex-col gap-1">
        <p className="shrink-0 text-muted-foreground" aria-live="polite">
          {results.length === ICON_KEYS.length
            ? `${ICON_KEYS.length} icons`
            : `${results.length} of ${ICON_KEYS.length} icons`}
        </p>
        {results.length > 0 ? (
          <IconGrid keys={results} icons={ICONS} selected={iconKey} onSelect={onIconChange} />
        ) : (
          <p className="flex flex-1 items-center justify-center rounded-lg border border-border text-muted-foreground">
            No icons match “{search.trim()}”.
          </p>
        )}
      </div>
      <IconPanel
        source={current}
        svg={svg}
        style={style}
        onColorChange={onColorChange}
        onStrokeWidthChange={onStrokeWidthChange}
        onSizeChange={onSizeChange}
        onPaddingChange={onPaddingChange}
        pngScale={pngScale}
        onPngScaleChange={onPngScaleChange}
      />
    </div>
  )
}

interface IconGridProps {
  keys: string[]
  icons: Catalog['ICONS']
  selected: string
  onSelect: (key: string) => void
}

/** Windowed grid: only the rows in view (plus a little overscan) are in the
 * DOM, so the full set of ~1,900 icons scrolls without ~10,000 SVG nodes.
 * Arrow keys move the selection. */
function IconGrid({ keys, icons, selected, onSelect }: IconGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setViewport((current) => (current.width === width && current.height === height ? current : { width, height }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A new search starts at the top of its results.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [keys])

  // Before the first measurement (and in tests, where nothing has a size)
  // assume a modest box so a first screen of icons still renders.
  const width = viewport.width || CELL * 8
  const height = viewport.height || CELL * 8
  const columns = Math.max(1, Math.floor(width / CELL))
  const cellWidth = width / columns
  const rows = Math.ceil(keys.length / columns)
  const firstRow = Math.max(0, Math.floor(scrollTop / CELL) - OVERSCAN)
  const lastRow = Math.min(rows, Math.ceil((scrollTop + height) / CELL) + OVERSCAN)
  const visible = keys.slice(firstRow * columns, lastRow * columns)
  // One tab stop: the selected icon, or the first rendered one while the
  // selection is filtered out or scrolled out of the rendered window.
  const tabStop = visible.includes(selected) ? selected : visible[0]

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    // Arrows move from the focused icon, which is the first rendered one
    // (not the selection) when the selection is out of view.
    const focused = event.target instanceof HTMLElement ? event.target.dataset.icon : undefined
    const index = keys.indexOf(focused ?? selected)
    const nextIndex = index < 0 ? 0 : Math.min(keys.length - 1, Math.max(0, index + step))
    const next = keys[nextIndex]
    onSelect(next)
    const element = scrollRef.current
    if (!element) return
    const top = Math.floor(nextIndex / columns) * CELL
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + CELL > element.scrollTop + element.clientHeight)
      element.scrollTop = top + CELL - element.clientHeight
    // The button may only exist after the re-render that scrolling causes.
    requestAnimationFrame(() => {
      element.querySelector<HTMLButtonElement>(`[data-icon="${next}"]`)?.focus()
    })
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      onKeyDown={handleKeyDown}
      role="group"
      aria-label="Icons"
      className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background dark:bg-muted/40"
    >
      <div className="relative" style={{ height: rows * CELL }}>
        {visible.map((key, offset) => {
          const index = firstRow * columns + offset
          const Icon = icons[key]
          const label = toKebabName(key)
          const isSelected = key === selected
          return (
            <button
              key={key}
              type="button"
              data-icon={key}
              onClick={() => onSelect(key)}
              aria-label={label}
              aria-pressed={isSelected}
              title={label}
              tabIndex={key === tabStop ? 0 : -1}
              className={cn(
                'absolute flex items-center justify-center rounded-md text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
              style={{
                top: Math.floor(index / columns) * CELL + 2,
                left: (index % columns) * cellWidth + (cellWidth - CELL) / 2 + 2,
                width: CELL - 4,
                height: CELL - 4,
              }}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface IconPanelProps {
  source: IconSource | null
  svg: string
  style: IconStyle
  onColorChange: (color: string) => void
  onStrokeWidthChange: (value: number) => void
  onSizeChange: (value: number) => void
  onPaddingChange: (value: number) => void
  pngScale: PngScale
  onPngScaleChange: (value: PngScale) => void
}

function IconPanel({
  source,
  svg,
  style,
  onColorChange,
  onStrokeWidthChange,
  onSizeChange,
  onPaddingChange,
  pngScale,
  onPngScaleChange,
}: IconPanelProps) {
  const colorId = useId()
  const sizeId = useId()
  const paddingId = useId()
  const strokeId = useId()

  const outputSize = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, style.size)))
  const pngSize = outputSize * Number(pngScale)
  const name = source?.name ?? 'icon'
  const previewUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ''

  const handleDownloadSvg = () => {
    if (!svg) return
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), iconFileName(name, 'svg'))
  }

  const handleDownloadPng = async () => {
    if (!svg) return
    try {
      downloadBlob(await svgToPngBlob(svg, pngSize, pngSize), iconFileName(name, 'png'))
    } catch {
      // Nothing to report beyond the absent download; the SVG paths can't
      // fail to draw unless the browser has no canvas at all.
    }
  }

  return (
    // Stacked under the grid in a narrow widget, the panel goes two columns
    // wide so it doesn't push the grid out of view.
    <div className="grid shrink-0 content-start gap-2 @sm:grid-cols-2 @lg:flex @lg:w-60 @lg:flex-col @lg:overflow-y-auto">
      <div className="flex items-stretch gap-2">
        <div
          className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-input"
          style={{ background: PREVIEW_BACKGROUND }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt={`${name} preview`}
              width={outputSize}
              height={outputSize}
              className="max-h-full max-w-full"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          <span className="truncate font-mono text-sm" title={name}>
            {name}
          </span>
          <span className="text-muted-foreground tabular-nums">
            SVG {outputSize} px, PNG {pngSize} px
          </span>
        </div>
      </div>

      <Field label="Color" htmlFor={colorId}>
        <div className="flex items-center gap-1.5">
          <Input
            id={colorId}
            type="color"
            value={style.color}
            onChange={(event) => onColorChange(event.target.value)}
            className="h-7 w-12 shrink-0 cursor-pointer p-0"
          />
          <span className="min-w-0 flex-1 truncate font-mono">{style.color}</span>
          <PageColorPicker onPick={onColorChange} />
          <ScreenColorPicker onPick={onColorChange} />
        </div>
      </Field>

      <Field label="Stroke width" htmlFor={strokeId}>
        <div className="flex items-center gap-2">
          <Slider
            min={MIN_STROKE}
            max={MAX_STROKE}
            step={0.25}
            value={style.strokeWidth}
            onValueChange={onStrokeWidthChange}
            aria-label="Stroke width slider"
            className="min-w-0 flex-1"
          />
          <NumberInput
            id={strokeId}
            value={style.strokeWidth}
            min={MIN_STROKE}
            max={MAX_STROKE}
            step={0.25}
            onChange={(value) => onStrokeWidthChange(Math.min(MAX_STROKE, Math.max(MIN_STROKE, value)))}
            className="h-7 w-16 px-1.5 text-xs tabular-nums md:text-xs"
          />
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (px)" htmlFor={sizeId}>
          <NumberInput
            id={sizeId}
            value={style.size}
            min={MIN_SIZE}
            max={MAX_SIZE}
            integer
            onChange={onSizeChange}
            className="h-7 px-1.5 text-xs tabular-nums md:text-xs"
          />
        </Field>
        <Field label="Padding (px)" htmlFor={paddingId}>
          <NumberInput
            id={paddingId}
            value={style.padding}
            min={0}
            max={clampPadding(outputSize, outputSize)}
            integer
            onChange={onPaddingChange}
            className="h-7 px-1.5 text-xs tabular-nums md:text-xs"
          />
        </Field>
      </div>

      <Field label="PNG scale">
        <SegmentedControl value={pngScale} onChange={onPngScaleChange} options={PNG_SCALE_OPTIONS} />
      </Field>

      <div className="grid grid-cols-2 gap-1 [&>button]:justify-start">
        <CopyButton value={svg} label="Copy SVG" />
        <CopyPngButton svg={svg} size={pngSize} />
        <Button
          type="button"
          variant="ghost"
          onClick={handleDownloadSvg}
          disabled={!svg}
          className="h-auto gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="size-3.5" />
          Download SVG
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleDownloadPng}
          disabled={!svg}
          className="h-auto gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="size-3.5" />
          Download PNG
        </Button>
      </div>
    </div>
  )
}

type CopyStatus = 'idle' | 'copied' | 'failed'

/** Copy PNG with the same Copied / Copy failed feedback as CopyButton. */
function CopyPngButton({ svg, size }: { svg: string; size: number }) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleCopy = async () => {
    if (!svg) return
    try {
      await copyPngToClipboard(svgToPngBlob(svg, size, size))
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1200)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleCopy}
      disabled={!svg}
      aria-live="polite"
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
        <ImageIcon className="size-3.5" />
      )}
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy PNG'}
    </Button>
  )
}

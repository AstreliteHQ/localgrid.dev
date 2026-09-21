import { forwardRef, useId, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Download, Plus, X } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/formatNumber'
import { useIsDarkTheme } from '@/theme/useThemeStore'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  computeBarLayout,
  computeLineLayout,
  computePieLayout,
  niceTicks,
  type ChartType,
  type DataPoint,
} from './chartMath'

// A fixed, colorblind-checked hue order (see the localgrid dataviz skill's
// reference palette) rather than random or evenly-spaced hues — used only
// to seed each new row's default color, never enforced afterward, since
// picking a color per point is the whole point of this widget.
const DEFAULT_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

function paletteColor(index: number): string {
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]
}

const SAMPLE_POINTS: DataPoint[] = [
  { id: 'sample-1', label: 'Jan', value: 12, color: paletteColor(0) },
  { id: 'sample-2', label: 'Feb', value: 19, color: paletteColor(1) },
  { id: 'sample-3', label: 'Mar', value: 8, color: paletteColor(2) },
  { id: 'sample-4', label: 'Apr', value: 15, color: paletteColor(3) },
]
const DEFAULT_TITLE = 'Monthly Sales'
const DEFAULT_CHART_TYPE: ChartType = 'bar'
const DEFAULT_LINE_COLOR = paletteColor(0)
const MAX_POINTS = 12

const CHART_TYPE_OPTIONS: { label: string; value: ChartType }[] = [
  { label: 'Bar', value: 'bar' },
  { label: 'Line', value: 'line' },
  { label: 'Pie', value: 'pie' },
]

// Fixed chart-surface colors rather than the app's own CSS variables: the
// exported PNG is rasterized from a serialized, page-detached copy of the
// SVG (see handleDownload), which can't resolve external stylesheet rules
// or `var(--color-*)` custom properties — only plain attribute values
// travel with the markup. Picking per theme here keeps the on-screen
// preview and the downloaded file identical either way.
const CHART_THEME = {
  light: { surface: '#fcfcfb', title: '#0b0b0b', text: '#52514e', grid: '#e3e2dc' },
  dark: { surface: '#1a1a19', title: '#ffffff', text: '#c3c2b7', grid: '#3a3a37' },
}

const CHART_W = 480
const CHART_H = 320
const MARGIN = { top: 46, right: 16, bottom: 34, left: 46 }
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom

function newPoint(index: number): DataPoint {
  return { id: nanoid(8), label: '', value: 0, color: paletteColor(index) }
}

function samePoints(a: DataPoint[], b: DataPoint[]): boolean {
  return (
    a.length === b.length && a.every((p, i) => p.label === b[i].label && p.value === b[i].value && p.color === b[i].color)
  )
}

function truncateLabel(label: string, max = 10): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not render the chart image'))
    image.src = src
  })
}

export default function ChartGeneratorWidget({ instanceId }: WidgetProps) {
  const [title, setTitle] = useWidgetState(instanceId, 'title', DEFAULT_TITLE)
  const [chartType, setChartType] = useWidgetState<ChartType>(instanceId, 'chartType', DEFAULT_CHART_TYPE)
  const [points, setPoints] = useWidgetState(instanceId, 'points', SAMPLE_POINTS)
  const [lineColor, setLineColor] = useWidgetState(instanceId, 'lineColor', DEFAULT_LINE_COLOR)
  useWidgetDirty(
    instanceId,
    title !== DEFAULT_TITLE ||
      chartType !== DEFAULT_CHART_TYPE ||
      !samePoints(points, SAMPLE_POINTS) ||
      lineColor !== DEFAULT_LINE_COLOR,
  )

  const isDark = useIsDarkTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const titleId = useId()

  const updatePoint = (id: string, patch: Partial<DataPoint>) => {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }
  const removePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id))
  }
  const addPoint = () => {
    setPoints((prev) => (prev.length >= MAX_POINTS ? prev : [...prev, newPoint(prev.length)]))
  }

  const handleDownload = async () => {
    const svg = svgRef.current
    if (!svg) return
    setDownloadError(null)
    const svgString = new XMLSerializer().serializeToString(svg)
    const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const image = await loadImage(url)
      // Rendered at 2x the on-screen size for a crisper download than a
      // 1:1 export of this fairly small widget would give.
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = CHART_W * scale
      canvas.height = CHART_H * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not render the chart image')
      ctx.scale(scale, scale)
      ctx.drawImage(image, 0, 0, CHART_W, CHART_H)
      const link = document.createElement('a')
      link.download = `${slugify(title) || 'chart'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not download the chart')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-end gap-1.5">
        <Field label="Title" htmlFor={titleId} className="min-w-0 flex-1">
          <Input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Chart title" />
        </Field>
        <SegmentedControl value={chartType} onChange={setChartType} options={CHART_TYPE_OPTIONS} />
      </div>

      {chartType === 'line' && (
        <Field label="Line color" className="max-w-24">
          <Input
            type="color"
            value={lineColor}
            onChange={(event) => setLineColor(event.target.value)}
            className="h-8 w-full cursor-pointer p-0"
            aria-label="Line color"
          />
        </Field>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {points.map((point, index) => (
          <DataPointRow
            key={point.id}
            index={index}
            point={point}
            onChange={(patch) => updatePoint(point.id, patch)}
            onRemove={() => removePoint(point.id)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={addPoint}
          disabled={points.length >= MAX_POINTS}
          title={points.length >= MAX_POINTS ? `Up to ${MAX_POINTS} data points` : undefined}
        >
          <Plus className="size-3" />
          Add data point
        </Button>
      </div>

      <div className="flex flex-col items-center gap-1.5 border-t border-border pt-2">
        <div className="w-full max-w-full overflow-hidden rounded-md border border-border">
          <ChartPreview ref={svgRef} title={title} chartType={chartType} points={points} lineColor={lineColor} isDark={isDark} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
          <Download className="size-3.5" />
          Download PNG
        </Button>
        {downloadError && <ErrorMessage>{downloadError}</ErrorMessage>}
      </div>
    </div>
  )
}

function DataPointRow({
  index,
  point,
  onChange,
  onRemove,
}: {
  index: number
  point: DataPoint
  onChange: (patch: Partial<DataPoint>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="color"
        value={point.color}
        onChange={(event) => onChange({ color: event.target.value })}
        aria-label={`Data point ${index + 1} color`}
        className="h-7 w-8 shrink-0 cursor-pointer p-0"
      />
      <Input
        value={point.label}
        onChange={(event) => onChange({ label: event.target.value })}
        placeholder="Label"
        spellCheck={false}
        aria-label={`Data point ${index + 1} label`}
        className="h-7 min-w-0 flex-[2] text-[11px]"
      />
      <Input
        type="number"
        value={point.value}
        onChange={(event) => onChange({ value: Number(event.target.value) })}
        aria-label={`Data point ${index + 1} value`}
        className="h-7 min-w-0 flex-1 font-mono text-[11px]"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label={`Remove data point ${index + 1}`}
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

interface ChartPreviewProps {
  title: string
  chartType: ChartType
  points: DataPoint[]
  lineColor: string
  isDark: boolean
}

const ChartPreview = forwardRef<SVGSVGElement, ChartPreviewProps>(function ChartPreview(
  { title, chartType, points, lineColor, isDark },
  ref,
) {
  const theme = isDark ? CHART_THEME.dark : CHART_THEME.light

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      width={CHART_W}
      height={CHART_H}
      role="img"
      aria-label={title || 'Chart preview'}
      className="h-auto w-full"
    >
      <rect x={0} y={0} width={CHART_W} height={CHART_H} fill={theme.surface} />
      {title && (
        <text
          x={CHART_W / 2}
          y={26}
          textAnchor="middle"
          fontSize={16}
          fontWeight={600}
          fill={theme.title}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {title}
        </text>
      )}
      {points.length === 0 ? (
        <text x={CHART_W / 2} y={CHART_H / 2} textAnchor="middle" fontSize={12} fill={theme.text}>
          Add a data point to see a chart
        </text>
      ) : chartType === 'pie' ? (
        <PieBody points={points} theme={theme} />
      ) : (
        <AxisBody chartType={chartType} points={points} lineColor={lineColor} theme={theme} />
      )}
    </svg>
  )
})

interface ChartTheme {
  surface: string
  title: string
  text: string
  grid: string
}

function AxisBody({
  chartType,
  points,
  lineColor,
  theme,
}: {
  chartType: 'bar' | 'line'
  points: DataPoint[]
  lineColor: string
  theme: ChartTheme
}) {
  const maxValue = Math.max(0, ...points.map((p) => Math.max(0, p.value)))
  const ticks = niceTicks(maxValue)
  const scaleMax = ticks[ticks.length - 1] || 1

  const bar = chartType === 'bar' ? computeBarLayout(points, PLOT_W, PLOT_H, scaleMax) : null
  const line = chartType === 'line' ? computeLineLayout(points, PLOT_W, PLOT_H, scaleMax) : null

  return (
    <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
      {ticks.map((tick) => {
        const y = PLOT_H - (tick / scaleMax) * PLOT_H
        return (
          <g key={tick}>
            <line x1={0} y1={y} x2={PLOT_W} y2={y} stroke={theme.grid} strokeWidth={1} />
            <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={theme.text}>
              {formatNumber(tick)}
            </text>
          </g>
        )
      })}

      {bar?.bars.map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={3} fill={b.color}>
            <title>{`${b.label || 'Value'}: ${formatNumber(b.value)}`}</title>
          </rect>
          {b.height > 0 && (
            <text x={b.centerX} y={b.y - 4} textAnchor="middle" fontSize={10} fill={theme.title}>
              {formatNumber(b.value)}
            </text>
          )}
        </g>
      ))}

      {line && (
        <>
          <path d={line.pathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {line.points.map((p) => (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={3.5} fill={p.color} stroke={theme.surface} strokeWidth={1.5}>
                <title>{`${p.label || 'Value'}: ${formatNumber(p.value)}`}</title>
              </circle>
              <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={10} fill={theme.title}>
                {formatNumber(p.value)}
              </text>
            </g>
          ))}
        </>
      )}

      <line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke={theme.grid} strokeWidth={1.5} />
      {points.map((p, i) => {
        const slot = PLOT_W / points.length
        const x = bar ? bar.bars[i].centerX : (line?.points[i].x ?? 0)
        return (
          <text
            key={p.id}
            x={x}
            y={PLOT_H + 16}
            textAnchor="middle"
            fontSize={10}
            fill={theme.text}
            style={{ maxWidth: slot }}
          >
            {truncateLabel(p.label || `#${i + 1}`)}
          </text>
        )
      })}
    </g>
  )
}

function PieBody({ points, theme }: { points: DataPoint[]; theme: ChartTheme }) {
  const cx = CHART_W / 2
  const cy = MARGIN.top + PLOT_H / 2
  const radius = Math.min(PLOT_W, PLOT_H) / 2 - 8
  const slices = computePieLayout(points, radius, cx, cy)

  if (slices.length === 0) {
    return (
      <text x={cx} y={cy} textAnchor="middle" fontSize={12} fill={theme.text}>
        Enter at least one positive value
      </text>
    )
  }

  if (slices.length === 1) {
    const only = slices[0]
    return (
      <g>
        <circle cx={cx} cy={cy} r={radius} fill={only.color}>
          <title>{`${only.label || 'Value'}: 100%`}</title>
        </circle>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#ffffff" fontWeight={600}>
          {truncateLabel(only.label || 'Value', 14)}
        </text>
      </g>
    )
  }

  return (
    <g>
      {slices.map((slice) => (
        <path key={slice.id} d={slice.pathD} fill={slice.color} stroke={theme.surface} strokeWidth={2}>
          <title>{`${slice.label || 'Value'}: ${formatNumber(slice.value)} (${formatNumber(slice.percentage)}%)`}</title>
        </path>
      ))}
      {slices
        .filter((slice) => slice.percentage >= 8)
        .map((slice) => (
          <text
            key={slice.id}
            x={slice.labelX}
            y={slice.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={600}
            stroke="#000000"
            strokeWidth={3}
            strokeOpacity={0.35}
            paintOrder="stroke"
            fill="#ffffff"
          >
            {`${Math.round(slice.percentage)}%`}
          </text>
        ))}
    </g>
  )
}

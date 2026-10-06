/** Pure layout math behind the Chart Generator widget — turns a list of
 * data points into plain numbers/SVG path strings, with no DOM or React
 * involved, so the geometry can be unit-tested on its own. */

export interface DataPoint {
  id: string
  label: string
  value: number
  color: string
}

export type ChartType = 'bar' | 'line' | 'pie'

/** Only positive values actually draw (a bar/slice/point can't have
 * negative extent), but a point stays in the data list so the user doesn't
 * lose it while typing a value. */
function positive(value: number): number {
  return Math.max(0, value)
}

/** Rounds `maxValue` up to a "nice" axis ceiling (1/2/5 × a power of ten)
 * and returns the evenly-spaced tick values from 0 up to it, the same way a
 * spreadsheet chart picks its gridlines rather than stopping exactly at the
 * data's own max. */
export function niceTicks(maxValue: number, tickCount = 4): number[] {
  if (maxValue <= 0) return [0]
  const rawStep = maxValue / tickCount
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / magnitude
  const niceResidual = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1
  const step = niceResidual * magnitude
  const top = Math.ceil(maxValue / step) * step
  // A huge finite maxValue (e.g. Number.MAX_VALUE) can make `top` overflow to
  // Infinity, which would spin the loop below forever — fall back to a plain
  // two-point axis rather than hanging the widget.
  if (!Number.isFinite(step) || !Number.isFinite(top)) return [0, maxValue]
  const ticks: number[] = []
  // Rounding to a fixed 6 decimals collapses distinct ticks to 0 once step
  // drops below 1e-6 (duplicate React keys, wrong axis max) — round by
  // significant digits instead, which scales with the value itself.
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

export interface BarMark {
  id: string
  label: string
  value: number
  color: string
  x: number
  y: number
  width: number
  height: number
  centerX: number
}

export interface BarLayout {
  bars: BarMark[]
  scaleMax: number
}

/** Lays out one bar per point across `width`×`height`, each centered in an
 * equal-width slot with a fifth of that slot left as a gap on either side. */
export function computeBarLayout(points: DataPoint[], width: number, height: number, scaleMax: number): BarLayout {
  const n = points.length
  const slot = n > 0 ? width / n : 0
  const gap = slot * 0.2
  const barWidth = Math.max(0, slot - gap)
  const bars = points.map((p, i) => {
    const value = positive(p.value)
    const ratio = scaleMax > 0 ? value / scaleMax : 0
    const barHeight = ratio * height
    const x = i * slot + gap / 2
    return {
      id: p.id,
      label: p.label,
      value: p.value,
      color: p.color,
      x,
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      centerX: x + barWidth / 2,
    }
  })
  return { bars, scaleMax }
}

export interface LineMark {
  id: string
  label: string
  value: number
  color: string
  x: number
  y: number
}

export interface LineLayout {
  points: LineMark[]
  pathD: string
  scaleMax: number
}

/** Lays out one point per data row, evenly spaced left to right (a single
 * point sits centered), connected by a single path in draw order. */
export function computeLineLayout(points: DataPoint[], width: number, height: number, scaleMax: number): LineLayout {
  const n = points.length
  const step = n > 1 ? width / (n - 1) : 0
  const marks = points.map((p, i) => {
    const value = positive(p.value)
    const ratio = scaleMax > 0 ? value / scaleMax : 0
    return {
      id: p.id,
      label: p.label,
      value: p.value,
      color: p.color,
      x: n > 1 ? i * step : width / 2,
      y: height - ratio * height,
    }
  })
  const pathD = marks.map((m, i) => `${i === 0 ? 'M' : 'L'} ${round(m.x)} ${round(m.y)}`).join(' ')
  return { points: marks, pathD, scaleMax }
}

export interface PieSlice {
  id: string
  label: string
  value: number
  color: string
  percentage: number
  pathD: string
  labelX: number
  labelY: number
}

/** Lays out one wedge per point, clockwise from the top (12 o'clock),
 * sized by each point's share of the total. Points with a value of 0 (or
 * negative) contribute no wedge — dividing by a total of 0 would otherwise
 * be undefined. */
export function computePieLayout(points: DataPoint[], radius: number, cx: number, cy: number): PieSlice[] {
  const total = points.reduce((sum, p) => sum + positive(p.value), 0)
  if (total <= 0) return []

  let angle = -Math.PI / 2
  const labelRadius = radius * 0.66
  return points
    .filter((p) => positive(p.value) > 0)
    .map((p) => {
      const value = positive(p.value)
      const fraction = value / total
      const startAngle = angle
      const endAngle = angle + fraction * Math.PI * 2
      angle = endAngle
      const startX = cx + radius * Math.cos(startAngle)
      const startY = cy + radius * Math.sin(startAngle)
      const endX = cx + radius * Math.cos(endAngle)
      const endY = cy + radius * Math.sin(endAngle)
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
      const pathD = `M ${round(cx)} ${round(cy)} L ${round(startX)} ${round(startY)} A ${round(radius)} ${round(radius)} 0 ${largeArc} 1 ${round(endX)} ${round(endY)} Z`
      const midAngle = (startAngle + endAngle) / 2
      return {
        id: p.id,
        label: p.label,
        value: p.value,
        color: p.color,
        percentage: fraction * 100,
        pathD,
        labelX: cx + labelRadius * Math.cos(midAngle),
        labelY: cy + labelRadius * Math.sin(midAngle),
      }
    })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export interface LegendRow {
  y: number
}

/** Stacks `count` legend rows of `rowHeight` vertically centered inside a
 * band starting at `top` and `height` tall, returning each row's center y.
 * When the rows don't fit at full height they are squeezed evenly to fill
 * the band instead of overflowing past the chart's bottom edge. */
export function computeLegendLayout(count: number, top: number, height: number, rowHeight: number): LegendRow[] {
  if (count <= 0) return []
  const step = Math.min(rowHeight, height / count)
  const start = top + (height - step * count) / 2
  return Array.from({ length: count }, (_, i) => ({ y: round(start + step * (i + 0.5)) }))
}

/** Rough rendered width of one character, as a fraction of the font size,
 * for a generic sans-serif face. Deliberately generous for wide glyphs so an
 * estimate errs toward truncating early rather than overflowing. */
function charWidthEm(char: string): number {
  if (/[WM@mw]/.test(char)) return 0.95
  if (/[A-Z%#&]/.test(char)) return 0.72
  if (/[ilj.,:;'|!I1 ]/.test(char)) return 0.32
  if (/[\u0020-\u024f]/.test(char)) return 0.6
  // CJK, emoji, and anything else outside Latin: assume a full em.
  return 1
}

/** Estimated rendered width of `text` at `fontSize`. SVG text can't be
 * measured outside a live layout (jsdom, the detached PNG export), so the
 * chart estimates instead. */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0
  for (const char of text) width += charWidthEm(char) * fontSize
  return width
}

/** Shortens `label` with a trailing ellipsis until its estimated width at
 * `fontSize` fits within `maxWidth`. */
export function fitLabel(label: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(label, fontSize) <= maxWidth) return label
  const chars = Array.from(label)
  while (chars.length > 0 && estimateTextWidth(`${chars.join('')}…`, fontSize) > maxWidth) chars.pop()
  return chars.length > 0 ? `${chars.join('')}…` : '…'
}

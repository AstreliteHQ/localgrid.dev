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
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
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

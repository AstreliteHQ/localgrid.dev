import { formatDateInZone, formatDateTimeInZone, formatTimeInZone } from './timeZones'

export interface TimelineLane {
  id: string
  name: string
  /** Index into `LANE_COLORS`, stored rather than the color itself so a
   * palette change lands on existing timelines too. */
  colorIndex: number
}

export interface TimelineEvent {
  id: string
  /** Epoch milliseconds. Everything downstream sorts and positions on this. */
  ms: number
  label: string
  laneId: string
  /** How the source text was read, e.g. `ISO 8601`. */
  format: string
  /** False when the widget had to assume an input zone to read it, which is
   * worth flagging: it is the usual cause of an event landing an hour off. */
  hasExplicitOffset: boolean
  /** The line this event was read from, shown when it is selected so a row
   * can always be traced back to the log it came from. */
  source: string
}

/** Fixed hex rather than theme tokens: these are identity colors for user
 * created lanes, so they have to stay the same color in both themes and be
 * distinguishable from each other rather than from the surface. Chosen at
 * the 500/400 end of the Tailwind ramps so they read on slate-50 and
 * slate-950 alike. */
export const LANE_COLORS = [
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Rose', value: '#fb7185' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Lime', value: '#a3e635' },
  { name: 'Orange', value: '#fb923c' },
]

export function laneColor(colorIndex: number): string {
  return LANE_COLORS[((colorIndex % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length].value
}

export function laneColorName(colorIndex: number): string {
  return LANE_COLORS[((colorIndex % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length].name
}

/** First palette entry not already on a lane, so a new timeline is visually
 * distinct until the palette is exhausted and it starts over. */
export function nextColorIndex(lanes: TimelineLane[]): number {
  const used = new Set(lanes.map((lane) => lane.colorIndex % LANE_COLORS.length))
  for (let i = 0; i < LANE_COLORS.length; i++) {
    if (!used.has(i)) return i
  }
  return lanes.length % LANE_COLORS.length
}

export interface TimelineBounds {
  startMs: number
  endMs: number
  /** End minus start; zero when every event shares one instant. */
  spanMs: number
}

/** The window the tracks are drawn against: first event to last, exactly as
 * asked for, with no padding so the two extremes sit on the ends. */
export function timelineBounds(events: TimelineEvent[]): TimelineBounds | null {
  if (events.length === 0) return null
  let startMs = events[0].ms
  let endMs = events[0].ms
  for (const event of events) {
    if (event.ms < startMs) startMs = event.ms
    if (event.ms > endMs) endMs = event.ms
  }
  return { startMs, endMs, spanMs: endMs - startMs }
}

/** Where an event sits on the track, 0 to 1. A zero span (one event, or
 * several at the same instant) puts everything in the middle rather than
 * dividing by zero. */
export function positionRatio(ms: number, bounds: TimelineBounds): number {
  if (bounds.spanMs === 0) return 0.5
  return Math.min(1, Math.max(0, (ms - bounds.startMs) / bounds.spanMs))
}

export function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id))
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Coarse, two-unit-at-most gap rendering: `430ms`, `1.5s`, `2m 3s`,
 * `1h 04m`, `3d 4h`. Durations are read at a glance while comparing rows, so
 * precision past the second unit is noise. */
export function formatDuration(deltaMs: number): string {
  const sign = deltaMs < 0 ? '-' : ''
  const abs = Math.abs(Math.round(deltaMs))
  if (abs < SECOND) return `${sign}${abs}ms`
  if (abs < MINUTE) {
    const seconds = abs / SECOND
    return `${sign}${seconds % 1 === 0 ? seconds : seconds.toFixed(abs < 10 * SECOND ? 3 : 1).replace(/\.?0+$/, '')}s`
  }
  if (abs < HOUR)
    return `${sign}${Math.floor(abs / MINUTE)}m ${String(Math.floor((abs % MINUTE) / SECOND)).padStart(2, '0')}s`
  if (abs < DAY)
    return `${sign}${Math.floor(abs / HOUR)}h ${String(Math.floor((abs % HOUR) / MINUTE)).padStart(2, '0')}m`
  return `${sign}${Math.floor(abs / DAY)}d ${Math.floor((abs % DAY) / HOUR)}h`
}

/** Signed gap, for the "since previous event" column. */
export function formatDelta(deltaMs: number): string {
  if (deltaMs === 0) return '+0ms'
  return `${deltaMs > 0 ? '+' : ''}${formatDuration(deltaMs)}`
}

/** True when the events do not all fall on one calendar day in the display
 * zone, which is what decides whether rows need to show a date at all. */
export function spansMultipleDays(events: TimelineEvent[], timeZone: string): boolean {
  if (events.length < 2) return false
  const first = formatDateInZone(events[0].ms, timeZone)
  return events.some((event) => formatDateInZone(event.ms, timeZone) !== first)
}

/** Plain-text export, one row per event with its gap from the previous one,
 * so a timeline can be pasted straight into a ticket or an incident doc. */
export function timelineToText(events: TimelineEvent[], lanes: TimelineLane[], timeZone: string): string {
  const sorted = sortEvents(events)
  const laneName = (laneId: string) => lanes.find((lane) => lane.id === laneId)?.name ?? ''
  const bounds = timelineBounds(sorted)
  // Fixed-width gap column so the deltas line up when the text is pasted
  // into a ticket, where no one is going to re-align it by hand.
  const lines = sorted.map((event, index) => {
    const delta = index === 0 ? '' : formatDelta(event.ms - sorted[index - 1].ms)
    const cells = [formatDateTimeInZone(event.ms, timeZone), delta.padStart(9), laneName(event.laneId), event.label]
    return cells.join('  ').trimEnd()
  })
  if (bounds) {
    lines.push('', `Span: ${formatDuration(bounds.spanMs)} (${timeZone})`)
  }
  return lines.join('\n')
}

/** Tick marks for the axis under the tracks: start, end, and evenly spaced
 * instants in between. Labels are times unless the span crosses a day, in
 * which case the date matters more than the second. */
export function axisTicks(bounds: TimelineBounds, count: number, timeZone: string): { ratio: number; label: string }[] {
  const steps = Math.max(2, count)
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1)
    const ms = bounds.startMs + bounds.spanMs * ratio
    return {
      ratio,
      label:
        bounds.spanMs >= DAY
          ? formatDateInZone(ms, timeZone)
          : formatTimeInZone(ms, timeZone, bounds.spanMs < 10 * SECOND),
    }
  })
}

import { getZonedParts } from './timeZoneMath'

const HOUR_MS = 60 * 60 * 1000

/** How a local hour reads for scheduling: `work` is a typical 9 to 6
 * office day, `night` is 10 PM to 6 AM, and `edge` is the reachable but
 * inconvenient early morning / evening in between. */
export type HourBand = 'work' | 'edge' | 'night'

export interface TimelineCell {
  /** Offset in whole hours from the reference hour (0 is the column that
   * contains the reference instant). Shared by every row, so the same
   * index lines up vertically across all cities. */
  offset: number
  /** Start of this column as an absolute instant. */
  startMs: number
  /** Local wall-clock hour and minute at `startMs` in the row's zone.
   * `minute` is non-zero only for zones on a :30 / :45 offset. */
  hour: number
  minute: number
  band: HourBand
  /** Set on the cell where a new local calendar day begins (and on the
   * first cell of the row), e.g. `Tue`, so a row shows where its midnight
   * falls relative to the others. */
  dayLabel: string | null
}

export function hourBand(hour: number): HourBand {
  if (hour >= 9 && hour < 18) return 'work'
  if (hour >= 6 && hour < 22) return 'edge'
  return 'night'
}

/** Start of the UTC hour containing `date`. Columns are aligned to UTC
 * hours (not the reference zone's) so every row shares the exact same
 * instants; zones on fractional offsets simply show `:30` / `:45` starts. */
export function referenceHourStart(date: Date): number {
  return Math.floor(date.getTime() / HOUR_MS) * HOUR_MS
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>()

function weekdayLabel(ms: number, timeZone: string): string {
  let formatter = weekdayFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    weekdayFormatters.set(timeZone, formatter)
  }
  return formatter.format(ms)
}

/** One row of the timeline: `count` consecutive hour columns for
 * `timeZone`, starting `hoursBefore` hours before the reference hour. */
export function buildTimelineRow(date: Date, timeZone: string, hoursBefore: number, count: number): TimelineCell[] {
  const base = referenceHourStart(date)
  const cells: TimelineCell[] = []
  let previousDay: number | null = null
  for (let i = 0; i < count; i++) {
    const offset = i - hoursBefore
    const startMs = base + offset * HOUR_MS
    const parts = getZonedParts(new Date(startMs), timeZone)
    const newDay = previousDay === null || parts.day !== previousDay
    previousDay = parts.day
    cells.push({
      offset,
      startMs,
      hour: parts.hour,
      minute: parts.minute,
      band: hourBand(parts.hour),
      dayLabel: newDay ? weekdayLabel(startMs, timeZone) : null,
    })
  }
  return cells
}

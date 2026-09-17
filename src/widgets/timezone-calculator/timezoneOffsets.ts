/** Pure, IANA-free time zone math behind the Time Zone Calculator widget.
 *
 * Unlike World Clock, which tracks real cities through their IANA zones
 * (DST included), this widget deals in raw UTC offsets: "what time is it at
 * UTC+9 when it's 14:00 at UTC-5". An offset is fixed the way ISO 8601 and
 * email headers express one, so the math below is plain arithmetic with no
 * zone database or DST transition involved.
 */

export interface UtcOffsetOption {
  minutes: number
  label: string
}

/** e.g. `UTC+05:30`, `UTC-08:00`, `UTC+00:00`. */
export function formatOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

/** Every UTC offset actually in use by a real-world time zone today, so
 * every option here corresponds to somewhere real rather than an arbitrary
 * half-hour grid. */
const OFFSET_MINUTES = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240, 270,
  300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 840,
]

export const UTC_OFFSETS: UtcOffsetOption[] = OFFSET_MINUTES.map((minutes) => ({
  minutes,
  label: formatOffsetLabel(minutes),
}))

/** The list's own offset closest to the browser's current UTC offset, used
 * to seed a sensible default rather than assuming UTC. */
export function closestOffsetMinutes(minutes: number): number {
  return OFFSET_MINUTES.reduce((best, candidate) =>
    Math.abs(candidate - minutes) < Math.abs(best - minutes) ? candidate : best,
  )
}

export interface WallClockParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** Parses a `datetime-local` input's raw value ("YYYY-MM-DDTHH:mm"). Native
 * datetime-local inputs only ever emit exactly that shape or an empty
 * string, so anything else is treated as not-yet-entered rather than papered
 * over. */
export function parseWallClock(value: string): WallClockParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) }
}

/** Formats parts back into a `datetime-local` value, the inverse of
 * `parseWallClock`. */
export function toWallClockInput(parts: WallClockParts): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export interface OffsetConversion {
  /** The real instant the source wall-clock time refers to. */
  instantMs: number
  target: WallClockParts
  /** Calendar-day difference between the target and source wall clocks —
   * can be more than +-1 day for offsets far enough apart (e.g. UTC-11 to
   * UTC+14 is a full day). */
  dayDiff: number
}

/** Converts a wall-clock time at one fixed UTC offset into its equivalent at
 * another. Both offsets are plain minutes-from-UTC, so this is exact
 * arithmetic: no DST, no zone lookups, no ambiguity. */
export function convertOffset(
  wallClock: WallClockParts,
  fromOffsetMinutes: number,
  toOffsetMinutes: number,
): OffsetConversion {
  const instantMs =
    Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day, wallClock.hour, wallClock.minute) -
    fromOffsetMinutes * 60000
  const targetMs = instantMs + toOffsetMinutes * 60000
  const target = new Date(targetMs)
  const targetParts: WallClockParts = {
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: target.getUTCDate(),
    hour: target.getUTCHours(),
    minute: target.getUTCMinutes(),
  }
  const sourceDay = Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day)
  const targetDay = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day)
  const dayDiff = Math.round((targetDay - sourceDay) / 86400000)
  return { instantMs, target: targetParts, dayDiff }
}

/** e.g. "Wed, Jan 15". Renders through the `UTC` time zone since `parts` is
 * already the correct wall clock — this only formats it, it never shifts it
 * again. */
export function formatDateLabel(parts: WallClockParts): string {
  const asUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(
    asUtc,
  )
}

export type HourFormat = '12h' | '24h'

/** e.g. "2:30 PM" in 12-hour form, or "14:30" in 24-hour form. */
export function formatTimeLabel(parts: WallClockParts, hourFormat: HourFormat = '12h'): string {
  const asUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: hourFormat === '24h' ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: hourFormat === '12h',
    hourCycle: hourFormat === '24h' ? 'h23' : undefined,
  }).format(asUtc)
}

/** `null` for the same calendar day, otherwise a signed day count (`+1d`,
 * `-2d`, ...). */
export function formatDayDiffLabel(dayDiff: number): string | null {
  if (dayDiff === 0) return null
  return dayDiff > 0 ? `+${dayDiff}d` : `${dayDiff}d`
}

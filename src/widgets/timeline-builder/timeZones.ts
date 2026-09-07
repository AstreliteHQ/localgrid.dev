/** The browser's own zone, resolved once. Every timestamp the widget shows
 * defaults to this, which is the whole point of the widget: logs arrive in
 * a mix of UTC, server-local and offset-carrying formats, and the person
 * reading them wants one consistent wall clock. */
export const LOCAL_TIME_ZONE: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  formatterCache.set(timeZone, formatter)
  return formatter
}

/** The wall clock an instant reads as in a given IANA zone. Milliseconds are
 * carried straight through from the instant since no zone offset has ever
 * been finer than a minute. */
export function getWallClock(ms: number, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(new Date(ms))
  return {
    year: Number(part(parts, 'year')),
    month: Number(part(parts, 'month')),
    day: Number(part(parts, 'day')),
    hour: Number(part(parts, 'hour')),
    minute: Number(part(parts, 'minute')),
    second: Number(part(parts, 'second')),
    millisecond: Math.floor(((ms % 1000) + 1000) % 1000),
  }
}

/** UTC offset in minutes a zone is at for a given instant, DST included, via
 * the standard trick of reading the zone's wall clock back as if it were UTC
 * and diffing against the real instant. */
export function getUtcOffsetMinutes(ms: number, timeZone: string): number {
  const w = getWallClock(ms, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return Math.round((asUtc - (ms - w.millisecond)) / 60000)
}

/** Inverse of `getWallClock`: the instant at which `wall` is the local
 * reading in `timeZone`. Guesses with the offset in force at the UTC
 * interpretation, then re-reads the offset at that candidate instant and
 * corrects once, which is what makes times close to a DST transition land on
 * the right side of it.
 *
 * Both awkward cases around a transition have a stated answer, matching
 * `Temporal`'s `'compatible'` disambiguation:
 *
 * - Ambiguous (the hour repeated when clocks go back): the first of the two,
 *   which is what the correction above already lands on.
 * - Nonexistent (the hour skipped when clocks go forward, e.g. `02:30` on
 *   2024-03-10 in `America/New_York`): shifted forward by the length of the
 *   gap, so `02:30` reads as `03:30`. A log line holding such a time is
 *   usually a machine writing local time through the transition, and moving
 *   it forward keeps it in order against its neighbours, where the
 *   correction alone would push it back before the gap instead. The round
 *   trip below is what tells the two apart: only a wall clock that never
 *   happened fails to format back to itself. */
export function wallClockToEpochMs(wall: WallClock, timeZone: string): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, wall.millisecond)
  const firstGuess = asUtc - getUtcOffsetMinutes(asUtc, timeZone) * 60000
  const corrected = asUtc - getUtcOffsetMinutes(firstGuess, timeZone) * 60000
  return readsAs(corrected, wall, timeZone) ? corrected : firstGuess
}

/** Whether an instant formats back to exactly this wall clock in this zone.
 * Milliseconds are carried through untouched by the conversion, so only the
 * fields a zone can move are compared. */
function readsAs(ms: number, wall: WallClock, timeZone: string): boolean {
  const actual = getWallClock(ms, timeZone)
  return (
    actual.year === wall.year &&
    actual.month === wall.month &&
    actual.day === wall.day &&
    actual.hour === wall.hour &&
    actual.minute === wall.minute &&
    actual.second === wall.second
  )
}

/** e.g. `UTC+05:30`, `UTC-08:00`, `UTC+00:00`. */
export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

export function formatDateInZone(ms: number, timeZone: string): string {
  const w = getWallClock(ms, timeZone)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

export function formatTimeInZone(ms: number, timeZone: string, withMillis = true): string {
  const w = getWallClock(ms, timeZone)
  const base = `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`
  return withMillis ? `${base}.${pad(w.millisecond, 3)}` : base
}

export function formatDateTimeInZone(ms: number, timeZone: string, withMillis = true): string {
  return `${formatDateInZone(ms, timeZone)} ${formatTimeInZone(ms, timeZone, withMillis)}`
}

/** Fallback list for engines without `Intl.supportedValuesOf`: one zone per
 * common offset rather than an attempt at completeness, since the picker is
 * only ever a convenience over "type the offset into the timestamp itself". */
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** Every zone the engine knows, with UTC and the visitor's own zone pinned
 * to the front so the two most-used entries never need scrolling for. */
export function listTimeZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  const all = typeof supported === 'function' ? supported.call(Intl, 'timeZone') : FALLBACK_TIME_ZONES
  const pinned = ['UTC', LOCAL_TIME_ZONE].filter((zone, index, list) => list.indexOf(zone) === index)
  return [...pinned, ...all.filter((zone) => !pinned.includes(zone)).sort((a, b) => a.localeCompare(b))]
}

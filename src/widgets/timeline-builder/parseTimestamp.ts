import { getWallClock, wallClockToEpochMs, type WallClock } from './timeZones'

export interface ParseOptions {
  /** Zone a timestamp is read in when the text carries no offset of its own,
   * which is the usual case for server logs. */
  timeZone: string
  /** Reference instant for formats that omit a year (syslog) or a whole date
   * (bare clock times). Defaults to now; passed explicitly by tests. */
  now?: number
}

export interface ParsedTimestamp {
  /** Epoch milliseconds, the single representation everything downstream
   * works in. */
  ms: number
  /** How the text was read, e.g. `Unix seconds` or `ISO 8601`. Surfaced in
   * the UI so a misread paste is obvious rather than silently plotted. */
  format: string
  /** True when the text carried its own UTC offset, meaning `timeZone` was
   * not consulted. */
  hasExplicitOffset: boolean
}

interface Match extends ParsedTimestamp {
  /** How many characters of the input the timestamp consumed, so the caller
   * can treat whatever follows as the label. */
  length: number
}

export interface ParsedEvent extends ParsedTimestamp {
  label: string
  /** The original line, kept so the UI can show what a row was built from. */
  source: string
}

/** Zone abbreviations that show up in log output. Deliberately small and
 * fixed: abbreviations are genuinely ambiguous (CST is both US Central and
 * China Standard, IST is India, Ireland and Israel), so this maps each to
 * its most common meaning in developer logs and nothing else. Anything not
 * listed is left for the surrounding text to be a label instead. */
const ZONE_ABBREVIATIONS: Record<string, number> = {
  Z: 0,
  UT: 0,
  UTC: 0,
  GMT: 0,
  HST: -600,
  AKST: -540,
  AKDT: -480,
  PST: -480,
  PDT: -420,
  MST: -420,
  MDT: -360,
  CST: -360,
  CDT: -300,
  EST: -300,
  EDT: -240,
  ART: -180,
  BRT: -180,
  WET: 0,
  WEST: 60,
  BST: 60,
  CET: 60,
  CEST: 120,
  EET: 120,
  EEST: 180,
  MSK: 180,
  IST: 330,
  ICT: 420,
  CTT: 480,
  JST: 540,
  KST: 540,
  AEST: 600,
  AEDT: 660,
  NZST: 720,
  NZDT: 780,
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function monthFromName(name: string): number | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null
}

/** Fractional seconds as written (1 to 9 digits) rounded to milliseconds,
 * so nanosecond-precision log timestamps keep their leading digits instead
 * of being read as a huge millisecond count. */
function fractionToMillis(fraction: string | undefined): number {
  if (!fraction) return 0
  return Math.floor(Number(`0.${fraction}`) * 1000)
}

/** Minutes east of UTC for a `Z` / `+01:00` / `-0800` / `CEST` token, or
 * null when the token is not an offset at all (an ordinary label word). */
export function parseOffsetToken(token: string): number | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const named = ZONE_ABBREVIATIONS[trimmed.toUpperCase()]
  if (named !== undefined) return named
  const numeric = /^([+-])(\d{2}):?(\d{2})?$/.exec(trimmed)
  if (!numeric) return null
  const hours = Number(numeric[2])
  const minutes = Number(numeric[3] ?? '0')
  // No zone has ever been further out than UTC+14, and a token like
  // `+99:99` is far more likely to be something else the surrounding text
  // wanted to keep than a four-day shift of the event.
  if (hours > 14 || minutes > 59) return null
  const sign = numeric[1] === '-' ? -1 : 1
  return sign * (hours * 60 + minutes)
}

/** Reads an offset immediately after a date/time core, tolerating one space
 * and the `GMT+02:00` form. Returns how much text it used so the caller can
 * keep the rest as the label. */
function consumeOffset(text: string): { offsetMinutes: number; length: number } | null {
  const match = /^\s?(?:(GMT|UTC)?([+-]\d{2}:?\d{2}|[+-]\d{2}(?!\d))|([A-Za-z]{1,4})\b)/.exec(text)
  if (!match) return null
  const token = match[2] ?? match[3] ?? ''
  const offsetMinutes = parseOffsetToken(token)
  if (offsetMinutes === null) return null
  return { offsetMinutes, length: match[0].length }
}

function fromOffset(wall: WallClock, offsetMinutes: number): number {
  return (
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, wall.millisecond) -
    offsetMinutes * 60000
  )
}

/** Resolves a wall clock either against an offset the text carried or,
 * failing that, against the zone the visitor picked for offset-less input. */
function resolve(
  wall: WallClock,
  offset: { offsetMinutes: number; length: number } | null,
  options: ParseOptions,
  format: string,
  coreLength: number,
): Match {
  return offset
    ? {
        ms: fromOffset(wall, offset.offsetMinutes),
        format,
        hasExplicitOffset: true,
        length: coreLength + offset.length,
      }
    : { ms: wallClockToEpochMs(wall, options.timeZone), format, hasExplicitOffset: false, length: coreLength }
}

function wall(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): WallClock {
  return { year, month, day, hour, minute, second, millisecond }
}

function isRealDate(w: WallClock): boolean {
  if (w.month < 1 || w.month > 12 || w.day < 1 || w.day > 31) return false
  if (w.hour > 23 || w.minute > 59 || w.second > 60) return false
  const check = new Date(Date.UTC(w.year, w.month - 1, w.day))
  return check.getUTCMonth() === w.month - 1 && check.getUTCDate() === w.day
}

/** `2024-01-15T12:34:56.789Z`, `2024-01-15 12:34:56`, `2024/01/15 12:34`,
 * and the date-only `2024-01-15`. The workhorse: nearly every structured log
 * emits some variant of this. */
const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?)?/

/** Basic-format ISO with no separators, as emitted by `date -u +%Y%m%dT%H%M%SZ`. */
const COMPACT_ISO_RE = /^(\d{4})(\d{2})(\d{2})[T_-]?(\d{2})(\d{2})(\d{2})(?:[.,](\d{1,9}))?/

/** Apache/nginx common log format: `15/Jan/2024:12:34:56 +0100`. */
const CLF_RE = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})[: ](\d{1,2}):(\d{2}):(\d{2})/

/** RFC 2822 / HTTP date: `Mon, 15 Jan 2024 12:34:56 GMT`, `15-Jan-2024 12:34`. */
const DAY_MONTH_RE =
  /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?)?/

/** `Jan 15, 2024 12:34:56`, `January 15 2024`. */
const MONTH_DAY_RE =
  /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?)?/

/** Output of plain `date`: `Mon Jan 15 12:34:56 CET 2024`. */
const UNIX_DATE_RE =
  /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?(?:\s+([A-Za-z]{2,5}|[+-]\d{4}))?\s+(\d{4})/

/** Syslog/RFC 3164: `Jan 15 12:34:56`, no year at all. */
const SYSLOG_RE = /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?/

/** A bare clock time, `12:34:56.789`, dated against the reference instant. */
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,9}))?/

const NUMERIC_RE = /^(\d+)(?:[.,](\d+))?(?![\d:/T-])/

const MAX_EPOCH_MS = 8.64e15

function matchIso(text: string, options: ParseOptions): Match | null {
  const m = ISO_RE.exec(text)
  if (!m) return null
  const w = wall(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
    fractionToMillis(m[7]),
  )
  if (!isRealDate(w)) return null
  const dateOnly = m[4] === undefined
  // A date with no time has no offset to read either: `2024-01-15 +01:00`
  // is not a thing, and treating a following token as one would eat a label.
  const offset = dateOnly ? null : consumeOffset(text.slice(m[0].length))
  return resolve(w, offset, options, dateOnly ? 'ISO date' : 'ISO 8601', m[0].length)
}

function matchCompactIso(text: string, options: ParseOptions): Match | null {
  const m = COMPACT_ISO_RE.exec(text)
  if (!m) return null
  const w = wall(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    fractionToMillis(m[7]),
  )
  if (!isRealDate(w)) return null
  return resolve(w, consumeOffset(text.slice(m[0].length)), options, 'ISO 8601 basic', m[0].length)
}

function matchClf(text: string, options: ParseOptions): Match | null {
  const m = CLF_RE.exec(text)
  if (!m) return null
  const month = monthFromName(m[2])
  if (month === null) return null
  const w = wall(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]))
  if (!isRealDate(w)) return null
  return resolve(w, consumeOffset(text.slice(m[0].length)), options, 'Common log format', m[0].length)
}

function matchDayMonth(text: string, options: ParseOptions): Match | null {
  const m = DAY_MONTH_RE.exec(text)
  if (!m) return null
  const month = monthFromName(m[2])
  if (month === null) return null
  const w = wall(
    Number(m[3]),
    month,
    Number(m[1]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
    fractionToMillis(m[7]),
  )
  if (!isRealDate(w)) return null
  const offset = m[4] === undefined ? null : consumeOffset(text.slice(m[0].length))
  return resolve(w, offset, options, 'RFC 2822', m[0].length)
}

function matchMonthDay(text: string, options: ParseOptions): Match | null {
  const m = MONTH_DAY_RE.exec(text)
  if (!m) return null
  const month = monthFromName(m[1])
  if (month === null) return null
  const w = wall(
    Number(m[3]),
    month,
    Number(m[2]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
    fractionToMillis(m[7]),
  )
  if (!isRealDate(w)) return null
  const offset = m[4] === undefined ? null : consumeOffset(text.slice(m[0].length))
  return resolve(w, offset, options, 'Month name', m[0].length)
}

function matchUnixDate(text: string, options: ParseOptions): Match | null {
  const m = UNIX_DATE_RE.exec(text)
  if (!m) return null
  const month = monthFromName(m[1])
  if (month === null) return null
  const w = wall(Number(m[8]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), fractionToMillis(m[6]))
  if (!isRealDate(w)) return null
  // The zone sits in the middle of this format, not after it, so it is read
  // from the capture rather than from the trailing text.
  const offsetMinutes = m[7] ? parseOffsetToken(m[7]) : null
  if (offsetMinutes !== null) {
    return { ms: fromOffset(w, offsetMinutes), format: 'date(1)', hasExplicitOffset: true, length: m[0].length }
  }
  return {
    ms: wallClockToEpochMs(w, options.timeZone),
    format: 'date(1)',
    hasExplicitOffset: false,
    length: m[0].length,
  }
}

function matchSyslog(text: string, options: ParseOptions): Match | null {
  const m = SYSLOG_RE.exec(text)
  if (!m) return null
  const month = monthFromName(m[1])
  if (month === null) return null
  const now = options.now ?? Date.now()
  const reference = getWallClock(now, options.timeZone)
  const build = (year: number) =>
    wall(year, month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), fractionToMillis(m[6]))
  if (!isRealDate(build(reference.year))) return null
  // The offset has to be read before the year is chosen: it can move the
  // instant by up to a day either way, which is exactly the margin the
  // rollover below tests against.
  const offset = consumeOffset(text.slice(m[0].length))
  const instantFor = (year: number) => {
    const candidate = build(year)
    return offset ? fromOffset(candidate, offset.offsetMinutes) : wallClockToEpochMs(candidate, options.timeZone)
  }
  let ms = instantFor(reference.year)
  // Syslog omits the year, so a line that would land in the future is
  // really from last year, the same rule log rotators use.
  if (ms - now > 86400000) ms = instantFor(reference.year - 1)
  return {
    ms,
    format: 'Syslog',
    hasExplicitOffset: offset !== null,
    length: m[0].length + (offset?.length ?? 0),
  }
}

function matchTimeOnly(text: string, options: ParseOptions): Match | null {
  const m = TIME_ONLY_RE.exec(text)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  const second = Number(m[3] ?? 0)
  // Without this, `Date.UTC` quietly rolls `12:34:99` over into `12:35:39`.
  if (hour > 23 || minute > 59 || second > 59) return null
  const now = options.now ?? Date.now()
  const today = getWallClock(now, options.timeZone)
  const w = wall(today.year, today.month, today.day, hour, minute, second, fractionToMillis(m[4]))
  return resolve(w, consumeOffset(text.slice(m[0].length)), options, 'Time only', m[0].length)
}

/** Epoch numbers, with the unit inferred from digit count: 10 digits is
 * seconds, 13 milliseconds, 16 microseconds, 19 nanoseconds. `minDigits`
 * guards against reading an ordinary number inside a sentence ("retried 3
 * times") as an instant. */
function matchNumeric(text: string, minDigits: number): Match | null {
  const m = NUMERIC_RE.exec(text)
  if (!m) return null
  const digits = m[1]
  if (digits.length < minDigits) return null
  const value = Number(m[2] ? `${digits}.${m[2]}` : digits)
  if (!Number.isFinite(value)) return null
  let ms: number
  let format: string
  if (digits.length <= 11) {
    ms = value * 1000
    format = 'Unix seconds'
  } else if (digits.length <= 14) {
    ms = value
    format = 'Unix milliseconds'
  } else if (digits.length <= 17) {
    ms = value / 1000
    format = 'Unix microseconds'
  } else {
    ms = value / 1e6
    format = 'Unix nanoseconds'
  }
  ms = Math.round(ms)
  if (Math.abs(ms) > MAX_EPOCH_MS) return null
  // Epoch numbers are absolute instants; the input zone never applies.
  return { ms, format, hasExplicitOffset: true, length: m[0].length }
}

/** Last resort: hand the whole string to the engine's own parser, which
 * covers locale-ish forms like `March 3, 2024 4:05 PM`. When the text
 * carried no offset the engine assumed the browser's zone, so the wall clock
 * it produced is re-placed into the zone the visitor actually picked. */
function matchNative(text: string, options: ParseOptions): ParsedTimestamp | null {
  // The engine's legacy parser is far too willing: it reads `12:34:99` as
  // 1999-01-01 12:34, which would undo the range checks the matchers above
  // apply. Requiring a four-digit year keeps the useful cases it does cover
  // (`March 3, 2024 4:05 PM`) without letting it invent one.
  if (!/\d{4}/.test(text) || text.length < 6) return null
  const parsed = Date.parse(text)
  if (Number.isNaN(parsed)) return null
  if (/(?:\bZ|\bUTC|\bGMT|[+-]\d{2}:?\d{2})\s*$/i.test(text)) {
    return { ms: parsed, format: 'Native', hasExplicitOffset: true }
  }
  const d = new Date(parsed)
  const local = wall(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  )
  return { ms: wallClockToEpochMs(local, options.timeZone), format: 'Native', hasExplicitOffset: false }
}

/** Ordered most specific first: the numeric reader runs last so it never
 * swallows the leading digits of a date. */
const MATCHERS: ((text: string, options: ParseOptions) => Match | null)[] = [
  matchIso,
  matchClf,
  matchCompactIso,
  matchUnixDate,
  matchDayMonth,
  matchMonthDay,
  matchSyslog,
  matchTimeOnly,
]

function matchAt(text: string, options: ParseOptions, minDigits: number): Match | null {
  for (const matcher of MATCHERS) {
    const match = matcher(text, options)
    if (match && Math.abs(match.ms) <= MAX_EPOCH_MS) return match
  }
  return matchNumeric(text, minDigits)
}

const OPENERS = /^[[({"'<]+/
const LABEL_LEADING = /^[\]})>"'`\s\-–—|,;:=]+/
const LABEL_TRAILING = /[\s\-–—|,;:]+$/

function cleanLabel(text: string): string {
  return text.replace(LABEL_LEADING, '').replace(LABEL_TRAILING, '').trim()
}

/** Parses a string that is expected to be nothing but a timestamp. Returns
 * null if anything is left over, which is what keeps `12:00 lunch` out of
 * the fields that want a bare instant. */
export function parseTimestamp(text: string, options: ParseOptions): ParsedTimestamp | null {
  const trimmed = text.trim().replace(OPENERS, '')
  if (!trimmed) return null
  const wholeIsNumeric = /^\d+([.,]\d+)?$/.test(trimmed)
  const match = matchAt(trimmed, options, wholeIsNumeric ? 1 : 6)
  if (match) {
    const rest = trimmed.slice(match.length).replace(/^[\])}>"'`\s]+/, '')
    if (!rest) return { ms: match.ms, format: match.format, hasExplicitOffset: match.hasExplicitOffset }
  }
  return matchNative(trimmed, options)
}

/** Parses one pasted line into an instant plus whatever text surrounds it.
 * The timestamp is looked for at the start of the line first (the log-line
 * case), then anywhere inside it (the `deploy finished at 12:04:31` case). */
export function parseEventLine(line: string, options: ParseOptions): ParsedEvent | null {
  const source = line.trim()
  if (!source) return null
  const leadingTrimmed = source.replace(OPENERS, '')
  const openerLength = source.length - leadingTrimmed.length

  const anchored = matchAt(leadingTrimmed, options, /^\d+([.,]\d+)?$/.test(leadingTrimmed) ? 1 : 6)
  if (anchored) {
    return {
      ms: anchored.ms,
      format: anchored.format,
      hasExplicitOffset: anchored.hasExplicitOffset,
      label: cleanLabel(leadingTrimmed.slice(anchored.length)),
      source,
    }
  }

  // Mid-line search. Bare numbers need 9+ digits here: inside prose, a short
  // number is far more likely to be a count than an epoch.
  for (let i = openerLength + 1; i < source.length; i++) {
    if (!/\d/.test(source[i])) continue
    if (/[\w.]/.test(source[i - 1])) continue
    const match = matchAt(source.slice(i), options, 9)
    if (!match) continue
    const before = source.slice(0, i)
    const after = source.slice(i + match.length)
    return {
      ms: match.ms,
      format: match.format,
      hasExplicitOffset: match.hasExplicitOffset,
      label: cleanLabel(`${cleanLabel(before)} ${cleanLabel(after)}`),
      source,
    }
  }

  const native = matchNative(leadingTrimmed, options)
  return native ? { ...native, label: '', source } : null
}

export interface ParsedLines {
  events: ParsedEvent[]
  /** Lines that held nothing recognizable, echoed back so the UI can say
   * which paste line was dropped instead of failing silently. */
  failed: string[]
}

export function parseEventLines(text: string, options: ParseOptions): ParsedLines {
  const events: ParsedEvent[] = []
  const failed: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parsed = parseEventLine(line, options)
    if (parsed) events.push(parsed)
    else failed.push(line.trim())
  }
  return { events, failed }
}

/** Shown in the widget's help popover, kept next to the matchers so the two
 * cannot drift apart. */
export const SUPPORTED_FORMAT_EXAMPLES = [
  '1705321496 / 1705321496789 (epoch s, ms, µs, ns)',
  '2024-01-15T12:34:56.789Z',
  '2024-01-15 12:34:56 +02:00',
  '15/Jan/2024:12:34:56 +0100',
  'Mon, 15 Jan 2024 12:34:56 GMT',
  'Jan 15 12:34:56 (syslog, year assumed)',
  'Mon Jan 15 12:34:56 CET 2024',
  '12:34:56.789 (today, in the input zone)',
]

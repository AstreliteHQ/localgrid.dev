import { describe, expect, it } from 'vitest'
import { parseEventLine, parseEventLines, parseOffsetToken, parseTimestamp } from './parseTimestamp'

const UTC = { timeZone: 'UTC' }
const PARIS = { timeZone: 'Europe/Paris' }

/** 2024-01-15T12:34:56.000Z */
const JAN_15_NOON_UTC = Date.UTC(2024, 0, 15, 12, 34, 56)

function ms(text: string, options = UTC): number | null {
  return parseTimestamp(text, options)?.ms ?? null
}

describe('parseTimestamp', () => {
  it('reads epoch seconds, milliseconds, microseconds and nanoseconds', () => {
    expect(parseTimestamp('1705322096', UTC)).toEqual({
      ms: 1705322096000,
      format: 'Unix seconds',
      hasExplicitOffset: true,
    })
    expect(ms('1705322096789')).toBe(1705322096789)
    expect(ms('1705322096789000')).toBe(1705322096789)
    expect(ms('1705322096789000000')).toBe(1705322096789)
  })

  it('reads fractional epoch seconds', () => {
    expect(ms('1705322096.5')).toBe(1705322096500)
  })

  it('reads ISO 8601 with an explicit offset', () => {
    expect(ms('2024-01-15T12:34:56Z')).toBe(JAN_15_NOON_UTC)
    expect(ms('2024-01-15T13:34:56+01:00')).toBe(JAN_15_NOON_UTC)
    expect(ms('2024-01-15T13:34:56+0100')).toBe(JAN_15_NOON_UTC)
    expect(ms('2024-01-15T12:34:56.789Z')).toBe(JAN_15_NOON_UTC + 789)
  })

  it('reads nanosecond-precision fractions without inflating them', () => {
    expect(ms('2024-01-15T12:34:56.789123456Z')).toBe(JAN_15_NOON_UTC + 789)
  })

  it('reads offset-less text in the chosen input zone, not the host zone', () => {
    // Paris is UTC+1 in January, so the same wall clock is an hour earlier.
    expect(ms('2024-01-15 13:34:56', PARIS)).toBe(JAN_15_NOON_UTC)
    expect(parseTimestamp('2024-01-15 13:34:56', PARIS)?.hasExplicitOffset).toBe(false)
  })

  it('accounts for daylight saving in the input zone', () => {
    // Paris is UTC+2 in July.
    expect(ms('2024-07-15 14:00:00', PARIS)).toBe(Date.UTC(2024, 6, 15, 12))
  })

  it('reads a date with no time as midnight in the input zone', () => {
    expect(ms('2024-01-15', PARIS)).toBe(Date.UTC(2024, 0, 14, 23))
  })

  it('reads slash-separated and compact ISO variants', () => {
    expect(ms('2024/01/15 12:34:56')).toBe(JAN_15_NOON_UTC)
    expect(ms('20240115T123456Z')).toBe(JAN_15_NOON_UTC)
  })

  it('reads common log format and RFC 2822', () => {
    expect(ms('15/Jan/2024:13:34:56 +0100')).toBe(JAN_15_NOON_UTC)
    expect(ms('Mon, 15 Jan 2024 12:34:56 GMT')).toBe(JAN_15_NOON_UTC)
    expect(ms('15 Jan 2024 12:34:56 UTC')).toBe(JAN_15_NOON_UTC)
  })

  it('reads month-name-first dates and date(1) output', () => {
    expect(ms('Jan 15, 2024 12:34:56')).toBe(JAN_15_NOON_UTC)
    expect(ms('Mon Jan 15 13:34:56 CET 2024')).toBe(JAN_15_NOON_UTC)
  })

  it('reads syslog lines against the reference year', () => {
    const now = Date.UTC(2024, 5, 1)
    expect(parseTimestamp('Jan 15 12:34:56', { timeZone: 'UTC', now })?.ms).toBe(JAN_15_NOON_UTC)
  })

  it('rolls a syslog date that would land in the future back a year', () => {
    const now = Date.UTC(2024, 0, 2)
    expect(parseTimestamp('Dec 31 12:34:56', { timeZone: 'UTC', now })?.ms).toBe(Date.UTC(2023, 11, 31, 12, 34, 56))
  })

  it('rejects a clock time whose fields are out of range', () => {
    const now = Date.UTC(2024, 0, 15, 20)
    // `Date.UTC` would quietly normalize this into 12:35:39.
    expect(parseTimestamp('12:34:99', { timeZone: 'UTC', now })).toBeNull()
    expect(parseTimestamp('25:00:00', { timeZone: 'UTC', now })).toBeNull()
  })

  it('applies the offset on a syslog line before deciding which year it is from', () => {
    // Read in the input zone alone the wall clock is 32 hours ahead of the
    // reference and would roll back a year; the offset it carries puts it
    // only 18 hours ahead, so it belongs to the reference year after all.
    const now = Date.UTC(2024, 5, 15, 12)
    expect(parseTimestamp('Jun 16 20:00:00 +1400', { timeZone: 'UTC', now })?.ms).toBe(Date.UTC(2024, 5, 16, 6))
  })

  it('dates a bare clock time against the reference day in the input zone', () => {
    const now = Date.UTC(2024, 0, 15, 20)
    expect(parseTimestamp('12:34:56.789', { timeZone: 'UTC', now })?.ms).toBe(JAN_15_NOON_UTC + 789)
  })

  it('strips wrapping brackets and quotes', () => {
    expect(ms('[2024-01-15T12:34:56Z]')).toBe(JAN_15_NOON_UTC)
    expect(ms('"2024-01-15T12:34:56Z"')).toBe(JAN_15_NOON_UTC)
  })

  it('falls back to the engine parser for looser text', () => {
    expect(parseTimestamp('March 3, 2024 4:05 PM', UTC)?.ms).toBe(Date.UTC(2024, 2, 3, 16, 5))
  })

  it('rejects text with no timestamp in it', () => {
    expect(parseTimestamp('deploy started', UTC)).toBeNull()
    expect(parseTimestamp('', UTC)).toBeNull()
    expect(parseTimestamp('2024-13-45T99:99:99Z', UTC)).toBeNull()
  })

  it('rejects a timestamp with trailing text', () => {
    expect(parseTimestamp('2024-01-15T12:34:56Z deploy', UTC)).toBeNull()
  })
})

describe('parseOffsetToken', () => {
  it('reads numeric and named offsets', () => {
    expect(parseOffsetToken('Z')).toBe(0)
    expect(parseOffsetToken('+05:30')).toBe(330)
    expect(parseOffsetToken('-0800')).toBe(-480)
    expect(parseOffsetToken('CEST')).toBe(120)
  })

  it('returns null for ordinary words', () => {
    expect(parseOffsetToken('deploy')).toBeNull()
    expect(parseOffsetToken('')).toBeNull()
  })

  it('rejects an offset no zone could be at', () => {
    // Left unchecked this reads as +6039 minutes and moves the event four days.
    expect(parseOffsetToken('+99:99')).toBeNull()
    expect(parseOffsetToken('+15:00')).toBeNull()
    expect(parseOffsetToken('+13:75')).toBeNull()
    expect(parseOffsetToken('+14:00')).toBe(840)
  })
})

describe('parseEventLine', () => {
  it('takes the leading timestamp and treats the rest as the label', () => {
    const parsed = parseEventLine('2024-01-15T12:34:56Z deploy started', UTC)
    expect(parsed?.ms).toBe(JAN_15_NOON_UTC)
    expect(parsed?.label).toBe('deploy started')
  })

  it('strips separators between the timestamp and the label', () => {
    expect(parseEventLine('1705322096 | cache warm', UTC)?.label).toBe('cache warm')
    expect(parseEventLine('1705322096 - cache warm', UTC)?.label).toBe('cache warm')
    expect(parseEventLine('[2024-01-15T12:34:56Z] INFO cache warm', UTC)?.label).toBe('INFO cache warm')
  })

  it('finds a timestamp in the middle of a sentence', () => {
    const parsed = parseEventLine('deploy finished at 2024-01-15T12:34:56Z on web-01', UTC)
    expect(parsed?.ms).toBe(JAN_15_NOON_UTC)
    expect(parsed?.label).toBe('deploy finished at on web-01')
  })

  it('does not mistake a small number inside prose for an epoch', () => {
    const parsed = parseEventLine('retried 3 times before 2024-01-15T12:34:56Z', UTC)
    expect(parsed?.ms).toBe(JAN_15_NOON_UTC)
  })

  it('keeps a label-only line out of the timeline', () => {
    expect(parseEventLine('nothing here', UTC)).toBeNull()
  })

  it('records how the line was read', () => {
    expect(parseEventLine('1705322096789 ping', UTC)?.format).toBe('Unix milliseconds')
    expect(parseEventLine('1705322096789 ping', UTC)?.source).toBe('1705322096789 ping')
  })
})

describe('parseEventLines', () => {
  it('splits a paste into one event per line and reports the rest', () => {
    const { events, failed } = parseEventLines(
      ['2024-01-15T12:34:56Z start', '', 'not a timestamp', '1705322096789 end'].join('\n'),
      UTC,
    )
    expect(events.map((event) => event.label)).toEqual(['start', 'end'])
    expect(failed).toEqual(['not a timestamp'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  closestOffsetMinutes,
  convertOffset,
  formatDateLabel,
  formatDayDiffLabel,
  formatOffsetLabel,
  formatTimeLabel,
  parseWallClock,
  toWallClockInput,
  UTC_OFFSETS,
  type WallClockParts,
} from './timezoneOffsets'

describe('formatOffsetLabel', () => {
  it('pads and signs positive, negative, and zero offsets', () => {
    expect(formatOffsetLabel(120)).toBe('UTC+02:00')
    expect(formatOffsetLabel(-300)).toBe('UTC-05:00')
    expect(formatOffsetLabel(0)).toBe('UTC+00:00')
  })

  it('renders a half-hour offset', () => {
    expect(formatOffsetLabel(330)).toBe('UTC+05:30')
  })
})

describe('UTC_OFFSETS', () => {
  it('is sorted from the westmost to the eastmost offset, with no duplicates', () => {
    const minutes = UTC_OFFSETS.map((o) => o.minutes)
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b))
    expect(new Set(minutes).size).toBe(minutes.length)
  })

  it('includes UTC itself', () => {
    expect(UTC_OFFSETS.some((o) => o.minutes === 0)).toBe(true)
  })
})

describe('closestOffsetMinutes', () => {
  it('returns an exact match unchanged', () => {
    expect(closestOffsetMinutes(330)).toBe(330)
  })

  it('snaps an in-between value to the nearest real offset', () => {
    expect(closestOffsetMinutes(325)).toBe(330)
  })
})

describe('parseWallClock', () => {
  it('parses a valid datetime-local value', () => {
    expect(parseWallClock('2026-01-15T14:30')).toEqual({ year: 2026, month: 1, day: 15, hour: 14, minute: 30 })
  })

  it('rejects an empty or malformed value', () => {
    expect(parseWallClock('')).toBeNull()
    expect(parseWallClock('not-a-date')).toBeNull()
  })

  it('round-trips through toWallClockInput', () => {
    const parts = parseWallClock('2026-03-05T09:05')
    expect(parts).not.toBeNull()
    expect(toWallClockInput(parts as WallClockParts)).toBe('2026-03-05T09:05')
  })
})

describe('convertOffset', () => {
  it('converts UTC+2 to UTC, the example from the request', () => {
    const wallClock = parseWallClock('2026-01-15T14:00') as WallClockParts
    const result = convertOffset(wallClock, 120, 0)
    expect(result.target).toEqual({ year: 2026, month: 1, day: 15, hour: 12, minute: 0 })
    expect(result.dayDiff).toBe(0)
  })

  it('rolls the calendar day forward when the target offset pushes past midnight', () => {
    const wallClock = parseWallClock('2026-01-15T23:00') as WallClockParts
    const result = convertOffset(wallClock, 0, 120)
    expect(result.target).toEqual({ year: 2026, month: 1, day: 16, hour: 1, minute: 0 })
    expect(result.dayDiff).toBe(1)
  })

  it('rolls the calendar day backward the same way', () => {
    const wallClock = parseWallClock('2026-01-15T00:30') as WallClockParts
    const result = convertOffset(wallClock, 0, -120)
    expect(result.target).toEqual({ year: 2026, month: 1, day: 14, hour: 22, minute: 30 })
    expect(result.dayDiff).toBe(-1)
  })

  it('can cross more than one calendar day for offsets far enough apart', () => {
    const wallClock = parseWallClock('2026-01-15T23:30') as WallClockParts
    const result = convertOffset(wallClock, -660, 840)
    expect(result.dayDiff).toBe(2)
  })

  it('is a no-op when converting an offset to itself', () => {
    const wallClock = parseWallClock('2026-06-01T10:15') as WallClockParts
    const result = convertOffset(wallClock, 330, 330)
    expect(result.target).toEqual(wallClock)
    expect(result.dayDiff).toBe(0)
  })

  it('computes the correct underlying instant', () => {
    // 14:00 at UTC+2 is 12:00 UTC.
    const wallClock = parseWallClock('2026-01-15T14:00') as WallClockParts
    const result = convertOffset(wallClock, 120, 0)
    expect(result.instantMs).toBe(Date.UTC(2026, 0, 15, 12, 0))
  })
})

describe('formatDateLabel and formatTimeLabel', () => {
  const parts: WallClockParts = { year: 2026, month: 1, day: 15, hour: 14, minute: 5 }

  it('formats the date as a short weekday, month, and day', () => {
    expect(formatDateLabel(parts)).toBe('Thu, Jan 15')
  })

  it('formats the time as a 12-hour clock', () => {
    expect(formatTimeLabel(parts)).toBe('2:05 PM')
  })
})

describe('formatDayDiffLabel', () => {
  it('is null for no day change', () => {
    expect(formatDayDiffLabel(0)).toBeNull()
  })

  it('signs a forward and backward day shift', () => {
    expect(formatDayDiffLabel(1)).toBe('+1d')
    expect(formatDayDiffLabel(-2)).toBe('-2d')
  })
})

import { describe, expect, it } from 'vitest'
import {
  LOCAL_TIME_ZONE,
  formatDateInZone,
  formatDateTimeInZone,
  formatOffsetLabel,
  formatTimeInZone,
  getUtcOffsetMinutes,
  getWallClock,
  isValidTimeZone,
  listTimeZones,
  wallClockToEpochMs,
} from './timeZones'

const JAN_15_NOON_UTC = Date.UTC(2024, 0, 15, 12, 0, 0, 789)

function wall(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return { year, month, day, hour, minute, second, millisecond }
}

describe('getWallClock', () => {
  it('reads an instant as the local clock of a zone', () => {
    expect(getWallClock(JAN_15_NOON_UTC, 'UTC')).toEqual(wall(2024, 1, 15, 12, 0, 0, 789))
    expect(getWallClock(JAN_15_NOON_UTC, 'Asia/Tokyo')).toEqual(wall(2024, 1, 15, 21, 0, 0, 789))
    expect(getWallClock(JAN_15_NOON_UTC, 'America/New_York')).toEqual(wall(2024, 1, 15, 7, 0, 0, 789))
  })

  it('keeps the millisecond whole for an instant that falls between them', () => {
    expect(getWallClock(JAN_15_NOON_UTC + 0.7, 'UTC').millisecond).toBe(789)
  })
})

describe('getUtcOffsetMinutes', () => {
  it('reports the offset in force at that instant, daylight saving included', () => {
    expect(getUtcOffsetMinutes(JAN_15_NOON_UTC, 'UTC')).toBe(0)
    expect(getUtcOffsetMinutes(JAN_15_NOON_UTC, 'Europe/Paris')).toBe(60)
    expect(getUtcOffsetMinutes(Date.UTC(2024, 6, 15, 12), 'Europe/Paris')).toBe(120)
    expect(getUtcOffsetMinutes(JAN_15_NOON_UTC, 'Asia/Kolkata')).toBe(330)
  })
})

describe('wallClockToEpochMs', () => {
  it('inverts getWallClock', () => {
    for (const zone of ['UTC', 'Europe/Paris', 'Asia/Kolkata', 'America/Los_Angeles']) {
      expect(getWallClock(wallClockToEpochMs(getWallClock(JAN_15_NOON_UTC, zone), zone), zone)).toEqual(
        getWallClock(JAN_15_NOON_UTC, zone),
      )
    }
  })

  it('places a wall clock against the offset in force on that side of a transition', () => {
    // Paris is UTC+1 in January and UTC+2 in July.
    expect(wallClockToEpochMs(wall(2024, 1, 15, 13), 'Europe/Paris')).toBe(Date.UTC(2024, 0, 15, 12))
    expect(wallClockToEpochMs(wall(2024, 7, 15, 14), 'Europe/Paris')).toBe(Date.UTC(2024, 6, 15, 12))
  })

  it('resolves the repeated hour to the first of the two', () => {
    // 01:30 happens twice in New York on 2024-11-03: 05:30Z (EDT) then 06:30Z (EST).
    expect(wallClockToEpochMs(wall(2024, 11, 3, 1, 30), 'America/New_York')).toBe(Date.UTC(2024, 10, 3, 5, 30))
  })

  it('shifts a time inside a spring-forward gap past it instead of behind it', () => {
    // 02:30 never happens in New York on 2024-03-10, so it reads as 03:30
    // (07:30Z) rather than being pushed back to 01:30 (06:30Z).
    const ms = wallClockToEpochMs(wall(2024, 3, 10, 2, 30), 'America/New_York')
    expect(ms).toBe(Date.UTC(2024, 2, 10, 7, 30))
    expect(formatTimeInZone(ms, 'America/New_York', false)).toBe('03:30:00')
  })

  it('leaves a real time either side of that gap alone', () => {
    expect(wallClockToEpochMs(wall(2024, 3, 10, 1, 30), 'America/New_York')).toBe(Date.UTC(2024, 2, 10, 6, 30))
    expect(wallClockToEpochMs(wall(2024, 3, 10, 4), 'America/New_York')).toBe(Date.UTC(2024, 2, 10, 8))
  })
})

describe('formatting', () => {
  it('prints a date, a time and both together in the given zone', () => {
    expect(formatDateInZone(JAN_15_NOON_UTC, 'Asia/Tokyo')).toBe('2024-01-15')
    expect(formatTimeInZone(JAN_15_NOON_UTC, 'Asia/Tokyo')).toBe('21:00:00.789')
    expect(formatTimeInZone(JAN_15_NOON_UTC, 'Asia/Tokyo', false)).toBe('21:00:00')
    expect(formatDateTimeInZone(JAN_15_NOON_UTC, 'UTC')).toBe('2024-01-15 12:00:00.789')
  })

  it('rolls the date over with the zone', () => {
    // 22:00Z on the 15th is already the 16th in Tokyo.
    expect(formatDateInZone(Date.UTC(2024, 0, 15, 22), 'Asia/Tokyo')).toBe('2024-01-16')
  })

  it('labels offsets in hours and minutes', () => {
    expect(formatOffsetLabel(0)).toBe('UTC+00:00')
    expect(formatOffsetLabel(330)).toBe('UTC+05:30')
    expect(formatOffsetLabel(-480)).toBe('UTC-08:00')
  })
})

describe('the zone picker list', () => {
  it('pins UTC and the local zone to the front and lists each zone once', () => {
    const zones = listTimeZones()
    expect(zones[0]).toBe('UTC')
    expect(zones).toContain(LOCAL_TIME_ZONE)
    expect(new Set(zones).size).toBe(zones.length)
  })

  it('only offers zones the engine will accept', () => {
    expect(listTimeZones().every(isValidTimeZone)).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
  })
})

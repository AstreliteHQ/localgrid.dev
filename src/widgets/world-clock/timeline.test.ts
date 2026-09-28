import { describe, expect, it } from 'vitest'
import { buildTimelineRow, hourBand, referenceFraction, referenceHourStart } from './timeline'

describe('hourBand', () => {
  it('classifies office hours, edges and night', () => {
    expect(hourBand(9)).toBe('work')
    expect(hourBand(17)).toBe('work')
    expect(hourBand(18)).toBe('edge')
    expect(hourBand(6)).toBe('edge')
    expect(hourBand(21)).toBe('edge')
    expect(hourBand(22)).toBe('night')
    expect(hourBand(0)).toBe('night')
    expect(hourBand(5)).toBe('night')
  })
})

describe('referenceHourStart / referenceFraction', () => {
  it('floors to the UTC hour and reports the position inside it', () => {
    const date = new Date('2024-01-15T10:45:00Z')
    expect(referenceHourStart(date)).toBe(Date.parse('2024-01-15T10:00:00Z'))
    expect(referenceFraction(date)).toBeCloseTo(0.75)
  })
})

describe('buildTimelineRow', () => {
  const date = new Date('2024-01-15T10:30:00Z')

  it('produces consecutive hours around the reference hour', () => {
    const row = buildTimelineRow(date, 'UTC', 2, 5)
    expect(row.map((c) => c.offset)).toEqual([-2, -1, 0, 1, 2])
    expect(row.map((c) => c.hour)).toEqual([8, 9, 10, 11, 12])
    expect(row[2].startMs).toBe(Date.parse('2024-01-15T10:00:00Z'))
  })

  it('shifts local hours by the zone offset while keeping shared instants', () => {
    const utc = buildTimelineRow(date, 'UTC', 0, 3)
    const tokyo = buildTimelineRow(date, 'Asia/Tokyo', 0, 3)
    expect(tokyo.map((c) => c.startMs)).toEqual(utc.map((c) => c.startMs))
    expect(tokyo.map((c) => c.hour)).toEqual([19, 20, 21])
  })

  it('keeps the minutes of fractional-offset zones', () => {
    const row = buildTimelineRow(date, 'Asia/Kolkata', 0, 1)
    expect(row[0]).toMatchObject({ hour: 15, minute: 30 })
  })

  it('labels the first cell and each local midnight with the weekday', () => {
    // 2024-01-15 is a Monday; 22:00 UTC is 07:00 Tuesday in Tokyo, and
    // midnight in UTC lands two columns in.
    const late = new Date('2024-01-15T22:10:00Z')
    const row = buildTimelineRow(late, 'UTC', 0, 4)
    expect(row.map((c) => c.dayLabel)).toEqual(['Mon', null, 'Tue', null])
  })

  it('handles DST transitions without skipping instants', () => {
    // US spring forward: 2024-03-10 02:00 local jumps to 03:00 in New York.
    const dst = new Date('2024-03-10T06:00:00Z')
    const row = buildTimelineRow(dst, 'America/New_York', 0, 3)
    expect(row.map((c) => c.hour)).toEqual([1, 3, 4])
  })
})

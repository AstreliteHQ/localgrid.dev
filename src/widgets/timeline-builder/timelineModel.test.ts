import { describe, expect, it } from 'vitest'
import { formatTimeInZone } from './timeZones'
import {
  LANE_COLORS,
  axisTicks,
  formatDelta,
  formatDuration,
  laneColor,
  nextColorIndex,
  positionRatio,
  sortEvents,
  spansMultipleDays,
  timelineBounds,
  timelineToText,
  type TimelineEvent,
  type TimelineLane,
} from './timelineModel'

const BASE = Date.UTC(2024, 0, 15, 12)

function event(id: string, offsetMs: number, laneId = 'lane-1', label = id): TimelineEvent {
  return {
    id,
    ms: BASE + offsetMs,
    label,
    laneId,
    format: 'ISO 8601',
    hasExplicitOffset: true,
    readZone: 'UTC',
    source: label,
  }
}

describe('timelineBounds', () => {
  it('runs from the earliest to the latest event whatever order they arrived in', () => {
    const bounds = timelineBounds([event('b', 5000), event('a', 0), event('c', 1000)])
    expect(bounds).toEqual({ startMs: BASE, endMs: BASE + 5000, spanMs: 5000 })
  })

  it('is null with no events', () => {
    expect(timelineBounds([])).toBeNull()
  })

  it('has a zero span for a single event', () => {
    expect(timelineBounds([event('a', 0)])?.spanMs).toBe(0)
  })
})

describe('positionRatio', () => {
  const bounds = { startMs: BASE, endMs: BASE + 1000, spanMs: 1000 }

  it('maps the ends to 0 and 1 and the middle to 0.5', () => {
    expect(positionRatio(BASE, bounds)).toBe(0)
    expect(positionRatio(BASE + 500, bounds)).toBe(0.5)
    expect(positionRatio(BASE + 1000, bounds)).toBe(1)
  })

  it('centers everything when the span is zero', () => {
    expect(positionRatio(BASE, { startMs: BASE, endMs: BASE, spanMs: 0 })).toBe(0.5)
  })

  it('clamps instants outside the bounds', () => {
    expect(positionRatio(BASE - 5000, bounds)).toBe(0)
    expect(positionRatio(BASE + 5000, bounds)).toBe(1)
  })
})

describe('formatDuration', () => {
  it('picks at most two units', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(430)).toBe('430ms')
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(123000)).toBe('2m 03s')
    expect(formatDuration(3900000)).toBe('1h 05m')
    expect(formatDuration(273600000)).toBe('3d 4h')
  })

  it('keeps the sign for a backwards gap', () => {
    expect(formatDuration(-430)).toBe('-430ms')
    expect(formatDelta(-1000)).toBe('-1s')
    expect(formatDelta(1000)).toBe('+1s')
    expect(formatDelta(0)).toBe('+0ms')
  })
})

describe('lane colors', () => {
  it('hands out an unused color to each new lane', () => {
    const lanes: TimelineLane[] = [{ id: 'a', name: 'A', colorIndex: 0 }]
    expect(nextColorIndex(lanes)).toBe(1)
    expect(nextColorIndex([...lanes, { id: 'b', name: 'B', colorIndex: 1 }])).toBe(2)
  })

  it('wraps around once the palette is used up', () => {
    const lanes = LANE_COLORS.map((_, index) => ({ id: `l${index}`, name: `L${index}`, colorIndex: index }))
    expect(nextColorIndex(lanes)).toBe(lanes.length % LANE_COLORS.length)
  })

  it('resolves any index to a real color', () => {
    expect(laneColor(0)).toBe(LANE_COLORS[0].value)
    expect(laneColor(LANE_COLORS.length)).toBe(LANE_COLORS[0].value)
  })
})

describe('sortEvents', () => {
  it('orders by instant without mutating the input', () => {
    const events = [event('b', 1000), event('a', 0)]
    expect(sortEvents(events).map((e) => e.id)).toEqual(['a', 'b'])
    expect(events.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('spansMultipleDays', () => {
  it('is false within one day and true across a midnight', () => {
    expect(spansMultipleDays([event('a', 0), event('b', 3600000)], 'UTC')).toBe(false)
    expect(spansMultipleDays([event('a', 0), event('b', 86400000)], 'UTC')).toBe(true)
  })

  it('answers in the display zone, not UTC', () => {
    // 12:00 and 20:00 UTC are the same UTC day but straddle midnight in Tokyo.
    expect(spansMultipleDays([event('a', 0), event('b', 8 * 3600000)], 'Asia/Tokyo')).toBe(true)
  })
})

describe('timelineToText', () => {
  it('exports rows in time order with gaps and a span footer', () => {
    const lanes: TimelineLane[] = [{ id: 'lane-1', name: 'Deploy', colorIndex: 0 }]
    const text = timelineToText([event('b', 5000, 'lane-1', 'done'), event('a', 0, 'lane-1', 'start')], lanes, 'UTC')
    expect(text).toContain('2024-01-15 12:00:00.000             Deploy  start')
    expect(text).toContain('+5s  Deploy  done')
    expect(text).toContain('Span: 5s (UTC)')
  })
})

describe('axisTicks', () => {
  it('labels evenly spaced instants across the bounds', () => {
    const ticks = axisTicks({ startMs: BASE, endMs: BASE + 60000, spanMs: 60000 }, 3, 'UTC')
    expect(ticks.map((tick) => tick.ratio)).toEqual([0, 0.5, 1])
    expect(ticks[0].label).toBe('12:00:00')
    expect(ticks[2].label).toBe('12:01:00')
  })

  it('labels dates instead of times once the span passes a day', () => {
    const ticks = axisTicks({ startMs: BASE, endMs: BASE + 2 * 86400000, spanMs: 2 * 86400000 }, 3, 'UTC')
    expect(ticks[0].label).toBe('2024-01-15')
    expect(ticks[2].label).toBe('2024-01-17')
  })
})

describe('formatting a scrubbed instant', () => {
  it('never prints a fractional millisecond for a position between events', () => {
    // The roving guide reads an instant off a 0..1 position, which lands
    // between milliseconds; the wall clock has to stay integral anyway.
    expect(formatTimeInZone(BASE + 42.7, 'UTC')).toBe('12:00:00.042')
  })
})

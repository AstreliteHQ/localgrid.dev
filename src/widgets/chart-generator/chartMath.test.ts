import { describe, expect, it } from 'vitest'
import { computeBarLayout, computeLineLayout, computePieLayout, niceTicks, type DataPoint } from './chartMath'

function point(id: string, label: string, value: number, color = '#2a78d6'): DataPoint {
  return { id, label, value, color }
}

describe('niceTicks', () => {
  it('rounds up to a nice step for a plain value', () => {
    expect(niceTicks(19, 4)).toEqual([0, 5, 10, 15, 20])
  })

  it('handles a max that is already a round number', () => {
    expect(niceTicks(20, 4)).toEqual([0, 10, 20])
  })

  it('is just [0] for a zero or negative max', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(-5)).toEqual([0])
  })

  it('scales sensibly for small magnitudes', () => {
    expect(niceTicks(0.9, 3)).toEqual([0, 0.5, 1])
  })

  it('falls back to a two-point axis instead of hanging when the ceiling overflows', () => {
    expect(niceTicks(Number.MAX_VALUE)).toEqual([0, Number.MAX_VALUE])
  })

  it('keeps ticks distinct for values far below the old fixed rounding precision', () => {
    const ticks = niceTicks(1e-8, 2)
    expect(new Set(ticks).size).toBe(ticks.length)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0)
  })
})

describe('computeBarLayout', () => {
  it('scales bar height to the given max, tallest touching the top', () => {
    const points = [point('a', 'A', 5), point('b', 'B', 10)]
    const { bars } = computeBarLayout(points, 200, 100, 10)
    expect(bars[0].height).toBeCloseTo(50)
    expect(bars[1].height).toBeCloseTo(100)
    expect(bars[1].y).toBeCloseTo(0)
  })

  it('spaces bars into equal slots with a gap between them', () => {
    const points = [point('a', 'A', 1), point('b', 'B', 1), point('c', 'C', 1)]
    const { bars } = computeBarLayout(points, 300, 100, 1)
    expect(bars).toHaveLength(3)
    // Each slot is 100 wide; the bar itself is narrower, leaving a gap.
    expect(bars[0].width).toBeLessThan(100)
    expect(bars[1].x).toBeGreaterThan(bars[0].x + bars[0].width)
  })

  it('treats a negative value as zero height rather than drawing below the baseline', () => {
    const { bars } = computeBarLayout([point('a', 'A', -5)], 100, 100, 10)
    expect(bars[0].height).toBe(0)
    expect(bars[0].y).toBe(100)
  })
})

describe('computeLineLayout', () => {
  it('spaces points evenly left to right and connects them in order', () => {
    const points = [point('a', 'A', 0), point('b', 'B', 5), point('c', 'C', 10)]
    const { points: marks, pathD } = computeLineLayout(points, 200, 100, 10)
    expect(marks[0].x).toBe(0)
    expect(marks[2].x).toBe(200)
    expect(marks[0].y).toBeCloseTo(100)
    expect(marks[2].y).toBeCloseTo(0)
    expect(pathD.startsWith('M ')).toBe(true)
    expect(pathD.match(/L /g)).toHaveLength(2)
  })

  it('centers a single point', () => {
    const { points: marks } = computeLineLayout([point('a', 'A', 1)], 200, 100, 1)
    expect(marks[0].x).toBe(100)
  })
})

describe('computePieLayout', () => {
  it('splits the circle proportionally to each value', () => {
    const points = [point('a', 'A', 25), point('b', 'B', 75)]
    const slices = computePieLayout(points, 50, 50, 50)
    expect(slices[0].percentage).toBeCloseTo(25)
    expect(slices[1].percentage).toBeCloseTo(75)
  })

  it('skips a zero-value point rather than drawing a degenerate wedge', () => {
    const points = [point('a', 'A', 10), point('b', 'B', 0)]
    const slices = computePieLayout(points, 50, 50, 50)
    expect(slices).toHaveLength(1)
    expect(slices[0].id).toBe('a')
  })

  it('is empty when every value is zero or negative', () => {
    expect(computePieLayout([point('a', 'A', 0), point('b', 'B', -1)], 50, 50, 50)).toEqual([])
  })

  it('starts the first wedge at the top (12 o’clock)', () => {
    const slices = computePieLayout([point('a', 'A', 1)], 50, 0, 0)
    // A single 100% slice starts and ends at the top: (0, -radius).
    expect(slices[0].pathD).toContain('M 0 0 L 0 -50')
  })
})

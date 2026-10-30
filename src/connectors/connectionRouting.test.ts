import { describe, expect, it } from 'vitest'
import {
  distanceToRoute,
  inputAnchor,
  outputAnchor,
  roundedPath,
  routeConnection,
  type GridGeometry,
  type GridRect,
  type Point,
} from './connectionRouting'

const geo: GridGeometry = { cols: 12, colWidth: 100, rowHeight: 90, margin: 16 }

const box = (rect: GridRect) => ({
  left: rect.x * (geo.colWidth + geo.margin),
  top: rect.y * (geo.rowHeight + geo.margin),
  right: rect.x * (geo.colWidth + geo.margin) + rect.w * geo.colWidth + (rect.w - 1) * geo.margin,
  bottom: rect.y * (geo.rowHeight + geo.margin) + rect.h * geo.rowHeight + (rect.h - 1) * geo.margin,
})

/** Whether an axis-aligned segment enters the inside of a widget. */
function crosses(a: Point, b: Point, rect: GridRect): boolean {
  const { left, top, right, bottom } = box(rect)
  const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]
  const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  return x1 < right && x2 > left && y1 < bottom && y2 > top
}

function expectClearRoute(points: Point[], rects: GridRect[]) {
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]]
    expect(a.x === b.x || a.y === b.y).toBe(true)
    for (const rect of rects) expect(crosses(a, b, rect)).toBe(false)
  }
}

describe('routeConnection', () => {
  it('starts on the source header output and ends on the target header input', () => {
    const from = { x: 0, y: 0, w: 3, h: 3 }
    const to = { x: 5, y: 2, w: 3, h: 3 }
    const points = routeConnection(from, to, [from, to], geo)

    expect(points[0]).toEqual(outputAnchor(from, geo))
    expect(points[points.length - 1]).toEqual(inputAnchor(to, geo))
    expect(points[0].x).toBe(box(from).right)
    expect(inputAnchor(to, geo).x).toBe(box(to).left)
  })

  it('runs straight down a shared gutter between facing widgets', () => {
    const from = { x: 0, y: 0, w: 3, h: 3 }
    const to = { x: 3, y: 1, w: 3, h: 3 }
    const points = routeConnection(from, to, [from, to], geo)

    expect(points).toHaveLength(4)
    expectClearRoute(points, [from, to])
  })

  it('goes around a widget sitting between the two ends', () => {
    const from = { x: 0, y: 2, w: 3, h: 2 }
    const wall = { x: 4, y: 0, w: 3, h: 6 }
    const to = { x: 8, y: 2, w: 3, h: 2 }
    const rects = [from, wall, to]

    expectClearRoute(routeConnection(from, to, rects, geo), rects)
  })

  it('stays in the gaps of a packed dashboard, target to the left of the source', () => {
    const rects = [
      { x: 0, y: 0, w: 6, h: 5 },
      { x: 6, y: 0, w: 6, h: 5 },
      { x: 0, y: 5, w: 3, h: 3 },
      { x: 3, y: 5, w: 5, h: 3 },
      { x: 8, y: 5, w: 4, h: 7 },
      { x: 0, y: 8, w: 5, h: 4 },
      { x: 5, y: 8, w: 3, h: 4 },
    ]

    expectClearRoute(routeConnection(rects[4], rects[2], rects, geo), rects)
    expectClearRoute(routeConnection(rects[0], rects[6], rects, geo, 6), rects)
  })

  it('never runs along the line above the first row', () => {
    const from = { x: 0, y: 0, w: 3, h: 3 }
    const wall = { x: 3, y: 0, w: 5, h: 6 }
    const to = { x: 8, y: 3, w: 4, h: 3 }
    const points = routeConnection(from, to, [from, wall, to], geo)

    expect(points.every((point) => point.y > 0)).toBe(true)
    expectClearRoute(points, [from, wall, to])
  })
})

describe('distanceToRoute', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ]

  it('measures to the nearest segment', () => {
    expect(distanceToRoute({ x: 50, y: 5 }, route)).toBe(5)
    expect(distanceToRoute({ x: 94, y: 60 }, route)).toBe(6)
  })

  it('measures past the ends to the end points', () => {
    expect(distanceToRoute({ x: -3, y: -4 }, route)).toBe(5)
  })
})

describe('roundedPath', () => {
  it('starts and ends on the first and last points', () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ])

    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d.endsWith('L 50 50')).toBe(true)
    expect(d).toContain('Q 50 0')
  })
})

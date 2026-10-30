/** A widget's position and size, in grid units. */
export interface GridRect {
  x: number
  y: number
  w: number
  h: number
}

export interface GridGeometry {
  cols: number
  colWidth: number
  rowHeight: number
  /** Gap between cells, the same on both axes. */
  margin: number
}

export interface Point {
  x: number
  y: number
}

/** Distance from a widget's top edge to its header connectors. */
export const HEADER_ANCHOR_Y = 18

const TURN_PENALTY = 40

// Gutter lines sit halfway into the gap before column k / row r.
const gutterX = (geo: GridGeometry, k: number) => k * (geo.colWidth + geo.margin) - geo.margin / 2
const gutterY = (geo: GridGeometry, r: number) => r * (geo.rowHeight + geo.margin) - geo.margin / 2

export function outputAnchor(rect: GridRect, geo: GridGeometry): Point {
  return {
    x: gutterX(geo, rect.x + rect.w) - geo.margin / 2,
    y: gutterY(geo, rect.y) + geo.margin / 2 + HEADER_ANCHOR_Y,
  }
}

export function inputAnchor(rect: GridRect, geo: GridGeometry): Point {
  return { x: gutterX(geo, rect.x) + geo.margin / 2, y: gutterY(geo, rect.y) + geo.margin / 2 + HEADER_ANCHOR_Y }
}

/** Orthogonal route from `from`'s header output to `to`'s header input that
 * only runs along the gaps between widgets. A shortest path search over the
 * gutter lattice, with a penalty per turn to keep it readable. `lane`
 * shifts the route inside the gutters so parallel wires stay apart. */
export function routeConnection(
  from: GridRect,
  to: GridRect,
  rects: readonly GridRect[],
  geo: GridGeometry,
  lane = 0,
): Point[] {
  const start = outputAnchor(from, geo)
  const end = inputAnchor(to, geo)
  const rows = Math.max(1, ...rects.map((rect) => rect.y + rect.h))
  const width = geo.cols + 1

  // Segment (k, r) -> (k, r + 1) runs through a widget straddling column line k.
  const verticalFree = (k: number, r: number) =>
    !rects.some((rect) => rect.x < k && k < rect.x + rect.w && rect.y <= r && r < rect.y + rect.h)
  // Segment (k, r) -> (k + 1, r) runs through a widget straddling row line r.
  const horizontalFree = (k: number, r: number) =>
    !rects.some((rect) => rect.y < r && r < rect.y + rect.h && rect.x <= k && k < rect.x + rect.w)

  const kOut = from.x + from.w
  const kIn = to.x
  const toPixel = (k: number, r: number): Point => ({ x: gutterX(geo, k) + lane, y: gutterY(geo, r) + lane })
  const finish = (nodes: Point[]) =>
    simplify([
      start,
      { x: gutterX(geo, kOut) + lane, y: start.y },
      ...nodes,
      { x: gutterX(geo, kIn) + lane, y: end.y },
      end,
    ])

  // Widgets facing each other across one gutter: a direct run when it is clear.
  if (kOut === kIn) {
    const [low, high] = [Math.min(from.y, to.y), Math.max(from.y, to.y)]
    let clear = true
    for (let r = low; r <= high; r++) clear &&= verticalFree(kOut, r)
    if (clear) return finish([])
  }

  // Dijkstra over (gutter node, axis it was reached on: 0 horizontal, 1 vertical).
  const size = width * (rows + 1) * 2
  const dist = new Float64Array(size).fill(Infinity)
  const prev = new Int32Array(size).fill(-1)
  const done = new Uint8Array(size)
  const id = (k: number, r: number, axis: number) => (r * width + k) * 2 + axis

  const relax = (state: number, cost: number, parent: number) => {
    if (cost < dist[state]) {
      dist[state] = cost
      prev[state] = parent
    }
  }
  relax(id(kOut, from.y, 1), start.y - gutterY(geo, from.y), -1)
  relax(id(kOut, from.y + 1, 1), gutterY(geo, from.y + 1) - start.y, -1)

  for (;;) {
    let current = -1
    for (let s = 0; s < size; s++)
      if (!done[s] && dist[s] < Infinity && (current < 0 || dist[s] < dist[current])) current = s
    if (current < 0) break
    done[current] = 1
    const axis = current % 2
    const node = (current - axis) / 2
    const k = node % width
    const r = (node - k) / width
    const step = (nk: number, nr: number, nextAxis: number, length: number) =>
      relax(id(nk, nr, nextAxis), dist[current] + length + (axis === nextAxis ? 0 : TURN_PENALTY), current)
    const colStep = geo.colWidth + geo.margin
    const rowStep = geo.rowHeight + geo.margin
    // The line above the first row sits under the app header, so wires never run along it.
    if (r > 0 && k > 0 && horizontalFree(k - 1, r)) step(k - 1, r, 0, colStep)
    if (r > 0 && k < geo.cols && horizontalFree(k, r)) step(k + 1, r, 0, colStep)
    if (r > 0 && verticalFree(k, r - 1)) step(k, r - 1, 1, rowStep)
    if (r < rows && verticalFree(k, r)) step(k, r + 1, 1, rowStep)
  }

  // Best arrival on the target's input gutter, ending on a vertical run.
  let best = -1
  let bestCost = Infinity
  for (const [r, extra] of [
    [to.y, end.y - gutterY(geo, to.y)],
    [to.y + 1, gutterY(geo, to.y + 1) - end.y],
  ]) {
    for (const axis of [0, 1]) {
      const cost = dist[id(kIn, r, axis)] + extra + (axis === 1 ? 0 : TURN_PENALTY)
      if (cost < bestCost) [best, bestCost] = [id(kIn, r, axis), cost]
    }
  }
  if (best < 0) return [start, end]

  const nodes: Point[] = []
  for (let state = best; state >= 0; state = prev[state]) {
    const node = (state - (state % 2)) / 2
    nodes.unshift(toPixel(node % width, Math.floor(node / width)))
  }
  return finish(nodes)
}

/** Drops points that sit on a straight line between their neighbours. */
function simplify(points: Point[]): Point[] {
  return points.filter((point, i) => {
    if (i === 0 || i === points.length - 1) return true
    const [a, b] = [points[i - 1], points[i + 1]]
    return !((a.x === point.x && point.x === b.x) || (a.y === point.y && point.y === b.y))
  })
}

/** Shortest distance from `point` to the polyline through `points`. */
export function distanceToRoute(point: Point, points: readonly Point[]): number {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
      : 0
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
  }
  return best
}

/** SVG path through `points` with rounded corners. */
export function roundedPath(points: readonly Point[], radius = 8): string {
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const [a, p, b] = [points[i - 1], points[i], points[i + 1]]
    const r = Math.min(radius, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2)
    const toward = (q: Point) => {
      const length = Math.hypot(q.x - p.x, q.y - p.y) || 1
      return { x: p.x + ((q.x - p.x) / length) * r, y: p.y + ((q.y - p.y) / length) * r }
    }
    const [entry, exit] = [toward(a), toward(b)]
    d += ` L ${entry.x} ${entry.y} Q ${p.x} ${p.y} ${exit.x} ${exit.y}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

import type { DashboardWidgetInstance } from '@/types/layout'
import { GRID_COLS } from './gridConstants'

export interface GridRect {
  x: number
  y: number
  w: number
  h: number
}

function overlaps(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function fits(rect: GridRect, occupied: readonly GridRect[]): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= GRID_COLS && !occupied.some((other) => overlaps(rect, other))
}

/** First row below every widget, i.e. where a new row would start. */
export function nextAvailableY(widgets: readonly GridRect[]): number {
  return widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0)
}

/** Where a new `w`×`h` widget should go on a dashboard holding `widgets`.
 *
 * With `near`, the spots right beside that widget come first (its right,
 * then its left, top-aligned with it), so a duplicate lands next to its
 * original whenever there's room. Otherwise — or when neither side is free —
 * it's the first free slot scanning rows top to bottom, left to right, and
 * finally a fresh row below everything (which always fits). */
export function findFreeSlot(
  widgets: readonly DashboardWidgetInstance[],
  size: { w: number; h: number },
  near?: GridRect,
): GridRect {
  const w = Math.min(Math.max(size.w, 1), GRID_COLS)
  const h = Math.max(size.h, 1)
  const occupied: GridRect[] = widgets.map(({ x, y, w, h }) => ({ x, y, w, h }))

  if (near) {
    const beside = [
      { x: near.x + near.w, y: near.y, w, h },
      { x: near.x - w, y: near.y, w, h },
    ]
    const spot = beside.find((rect) => fits(rect, occupied))
    if (spot) return spot
  }

  const bottom = nextAvailableY(occupied)
  for (let y = 0; y < bottom; y++) {
    for (let x = 0; x + w <= GRID_COLS; x++) {
      const rect = { x, y, w, h }
      if (fits(rect, occupied)) return rect
    }
  }
  return { x: 0, y: bottom, w, h }
}

import { describe, expect, it } from 'vitest'
import type { DashboardWidgetInstance } from '@/types/layout'
import { findFreeSlot, nextAvailableY } from './placement'

function widget(instanceId: string, x: number, y: number, w: number, h: number): DashboardWidgetInstance {
  return { instanceId, widgetId: 'base64', x, y, w, h }
}

describe('findFreeSlot', () => {
  it('starts at the top-left of an empty dashboard', () => {
    expect(findFreeSlot([], { w: 4, h: 3 })).toEqual({ x: 0, y: 0, w: 4, h: 3 })
  })

  it('places the widget right of `near` when there is room', () => {
    const original = widget('a', 0, 0, 4, 3)
    expect(findFreeSlot([original], original, original)).toEqual({ x: 4, y: 0, w: 4, h: 3 })
  })

  it('falls back to the left of `near` when its right side is taken', () => {
    const original = widget('a', 4, 0, 4, 3)
    const right = widget('b', 8, 0, 4, 3)
    expect(findFreeSlot([original, right], original, original)).toEqual({ x: 0, y: 0, w: 4, h: 3 })
  })

  it('uses the first free gap that fits when neither side of `near` is free', () => {
    const widgets = [widget('a', 0, 0, 4, 3), widget('b', 4, 0, 4, 3), widget('c', 8, 0, 4, 3), widget('d', 0, 3, 6, 3)]
    // Row 3 has a 6-wide gap at x 6, beside the full first row.
    expect(findFreeSlot(widgets, { w: 4, h: 3 }, widgets[1])).toEqual({ x: 6, y: 3, w: 4, h: 3 })
  })

  it('never overlaps a taller neighbour that only partly covers a gap', () => {
    const widgets = [widget('a', 0, 0, 6, 2), widget('tall', 6, 0, 6, 6), widget('b', 0, 2, 6, 4)]
    expect(findFreeSlot(widgets, { w: 6, h: 2 }, widgets[0])).toEqual({ x: 0, y: 6, w: 6, h: 2 })
  })

  it('starts a new row below everything when nothing fits', () => {
    const original = widget('a', 0, 0, 12, 4)
    expect(findFreeSlot([original], original, original)).toEqual({ x: 0, y: 4, w: 12, h: 4 })
  })

  it('clamps a widget wider than the grid', () => {
    expect(findFreeSlot([], { w: 20, h: 2 })).toEqual({ x: 0, y: 0, w: 12, h: 2 })
  })
})

describe('nextAvailableY', () => {
  it('is the bottom edge of the lowest widget', () => {
    expect(nextAvailableY([widget('a', 0, 0, 2, 3), widget('b', 2, 1, 2, 5)])).toBe(6)
    expect(nextAvailableY([])).toBe(0)
  })
})

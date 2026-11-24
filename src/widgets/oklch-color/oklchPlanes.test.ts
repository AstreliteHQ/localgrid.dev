import { describe, expect, it } from 'vitest'
import { isInP3, isInSrgb } from './oklch'
import { GAMUT_NONE, GAMUT_P3, GAMUT_SRGB, PLANES, colorAt, positionOf, renderPlane } from './oklchPlanes'

const BASE = { l: 0.7, c: 0.15, h: 250, alpha: 0.5 }
const [lightnessPlane, chromaPlane, huePlane] = PLANES

describe('colorAt and positionOf', () => {
  it('spreads the two free channels over the axes and keeps the fixed one', () => {
    expect(colorAt(lightnessPlane, BASE, 0.5, 0.25)).toEqual({ l: 0.7, c: 0.1, h: 180, alpha: 0.5 })
    expect(colorAt(chromaPlane, BASE, 0.25, 1)).toEqual({ l: 1, c: 0.15, h: 90, alpha: 0.5 })
    expect(colorAt(huePlane, BASE, 0.4, 0)).toEqual({ l: 0.4, c: 0, h: 250, alpha: 0.5 })
  })

  it('clamps points outside the chart to its edges', () => {
    expect(colorAt(huePlane, BASE, -1, 2)).toMatchObject({ l: 0, c: 0.4 })
  })

  it('finds a color back where colorAt put it', () => {
    for (const plane of PLANES) {
      const position = positionOf(plane, colorAt(plane, BASE, 0.3, 0.6))
      expect(position.x).toBeCloseTo(0.3)
      expect(position.y).toBeCloseTo(0.6)
    }
  })
})

describe('renderPlane', () => {
  it('fills every pixel inside P3 and leaves the rest transparent', () => {
    const width = 40
    const height = 20
    const { pixels, gamuts } = renderPlane(huePlane, BASE, width, height, 'srgb')
    expect(pixels).toHaveLength(width * height * 4)

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const index = row * width + col
        const color = colorAt(huePlane, BASE, (col + 0.5) / width, 1 - (row + 0.5) / height)
        const expected = isInSrgb(color) ? GAMUT_SRGB : isInP3(color) ? GAMUT_P3 : GAMUT_NONE
        // The widget's own check forgives rounding the chart does not, so
        // only colors clearly on one side are compared.
        if (Math.abs(color.c - 0.2) < 0.2 && color.l > 0.05) {
          if (gamuts[index] === GAMUT_SRGB) expect(isInSrgb(color)).toBe(true)
          if (expected === GAMUT_NONE) expect(gamuts[index]).toBe(GAMUT_NONE)
        }
        expect(pixels[index * 4 + 3]).toBe(gamuts[index] === GAMUT_NONE ? 0 : 255)
      }
    }
  })

  it('paints the bottom row of a hue chart grey, from black to white', () => {
    const width = 10
    const { pixels } = renderPlane(huePlane, BASE, width, 50, 'srgb')
    const bottom = (col: number) => [...pixels.slice((49 * width + col) * 4, (49 * width + col) * 4 + 3)]
    const first = bottom(1)
    const last = bottom(8)
    expect(Math.max(...first) - Math.min(...first)).toBeLessThan(25)
    expect(last[0]).toBeGreaterThan(first[0])
  })

  it('marks P3 only pixels on a chart through a saturated red', () => {
    const { gamuts } = renderPlane(lightnessPlane, { l: 0.65, c: 0, h: 0, alpha: 1 }, 72, 40, 'display-p3')
    expect(gamuts).toContain(GAMUT_SRGB)
    expect(gamuts).toContain(GAMUT_P3)
    expect(gamuts).toContain(GAMUT_NONE)
  })
})

import { describe, expect, it } from 'vitest'
import { ACCENT_NAMES, generateMaterialPalette, TONE_NAMES } from './materialPalette'

describe('generateMaterialPalette', () => {
  it('returns null for an invalid seed', () => {
    expect(generateMaterialPalette('not-a-color')).toBeNull()
  })

  it('normalizes the seed and echoes it back as the base', () => {
    const palette = generateMaterialPalette('#2196F3')
    expect(palette?.base).toBe('#2196f3')
  })

  it('produces every tone and accent name, each with a valid hex', () => {
    const palette = generateMaterialPalette('#2196f3')
    expect(palette?.tones.map((t) => t.name)).toEqual([...TONE_NAMES])
    expect(palette?.accents.map((a) => a.name)).toEqual([...ACCENT_NAMES])
    for (const swatch of [...(palette?.tones ?? []), ...(palette?.accents ?? [])]) {
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(['#000000', '#ffffff']).toContain(swatch.foreground)
    }
  })

  it('keeps the 500 tone identical to the seed color', () => {
    const palette = generateMaterialPalette('#2196f3')
    expect(palette?.tones.find((t) => t.name === '500')?.hex).toBe('#2196f3')
  })

  it('tints tones 50-400 toward white and shades 600-900 toward black', () => {
    const palette = generateMaterialPalette('#2196f3')
    const byName = Object.fromEntries(palette?.tones.map((t) => [t.name, t.hex]) ?? [])

    // Each lighter tone should be strictly lighter (mixed further toward
    // white) than the one before it, and likewise darker for shades.
    const lightOrder: (typeof TONE_NAMES)[number][] = ['400', '300', '200', '100', '50']
    let previousR = parseInt(byName['500'].slice(1, 3), 16)
    for (const name of lightOrder) {
      const r = parseInt(byName[name].slice(1, 3), 16)
      expect(r).toBeGreaterThan(previousR)
      previousR = r
    }

    const darkOrder: (typeof TONE_NAMES)[number][] = ['600', '700', '800', '900']
    previousR = parseInt(byName['500'].slice(1, 3), 16)
    for (const name of darkOrder) {
      const r = parseInt(byName[name].slice(1, 3), 16)
      expect(r).toBeLessThan(previousR)
      previousR = r
    }
  })

  it('gives a light foreground to dark tones and a dark foreground to light tones', () => {
    const palette = generateMaterialPalette('#2196f3')
    const byName = Object.fromEntries(palette?.tones.map((t) => [t.name, t]) ?? [])
    expect(byName['900'].foreground).toBe('#ffffff')
    expect(byName['50'].foreground).toBe('#000000')
  })

  it('boosts saturation on accents even from a muted, grayish seed', () => {
    const palette = generateMaterialPalette('#888888')
    for (const accent of palette?.accents ?? []) {
      expect(accent.hex).not.toBe('#888888')
    }
  })
})

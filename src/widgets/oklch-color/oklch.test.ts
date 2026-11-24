import { describe, expect, it } from 'vitest'
import { formatOklab, formatOklch, isInP3, isInSrgb, parseColor, toSrgbColord, toSrgbGamut } from './oklch'

describe('parseColor', () => {
  it('reads oklch() with percent or number lightness, angle units and alpha', () => {
    expect(parseColor('oklch(70% 0.15 250)')).toEqual({ l: 0.7, c: 0.15, h: 250, alpha: 1 })
    expect(parseColor('oklch(0.7 0.15 250deg / 50%)')).toEqual({ l: 0.7, c: 0.15, h: 250, alpha: 0.5 })
    expect(parseColor('OKLCH(50% 25% 0.5turn / 0.2)')).toEqual({ l: 0.5, c: 0.1, h: 180, alpha: 0.2 })
  })

  it('treats none as zero and wraps the hue', () => {
    expect(parseColor('oklch(50% none 20)')).toEqual({ l: 0.5, c: 0, h: 20, alpha: 1 })
    expect(parseColor('oklch(50% 0.1 -90)')?.h).toBe(270)
  })

  it('keeps the real chroma of a color outside sRGB', () => {
    expect(parseColor('oklch(90% 0.37 145)')?.c).toBe(0.37)
  })

  it('reads oklab() into its polar form', () => {
    const color = parseColor('oklab(60% 0.1 -0.1 / 0.4)')!
    expect(color.l).toBeCloseTo(0.6)
    expect(color.c).toBeCloseTo(Math.SQRT2 / 10)
    expect(color.h).toBeCloseTo(315)
    expect(color.alpha).toBe(0.4)
  })

  it('reads hex, rgb(), hsl() and named colors through colord', () => {
    expect(formatOklch(parseColor('#ff0000')!)).toBe('oklch(62.8% 0.2577 29.23)')
    expect(formatOklch(parseColor('rgb(0 0 255)')!)).toBe('oklch(45.2% 0.3132 264.05)')
    expect(formatOklch(parseColor('hsl(0, 0%, 100%)')!)).toBe('oklch(100% 0 0)')
    expect(formatOklch(parseColor('rebeccapurple')!)).toBe('oklch(44.03% 0.1603 303.37)')
    expect(parseColor('#ff000080')?.alpha).toBe(0.5)
  })

  it('rejects anything that is not a color', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('oklch(50%)')).toBeNull()
    expect(parseColor('not-a-color')).toBeNull()
  })

  it('rejects oklab() channels whose chroma overflows to Infinity', () => {
    expect(parseColor('oklab(50% 1.7e308 1.7e308)')).toBeNull()
    expect(parseColor('oklab(50% 1e300 0)')?.c).toBe(1e300)
  })
})

describe('formatting', () => {
  it('formats OKLCH and OKLab, with alpha only below 1', () => {
    expect(formatOklch({ l: 0.62796, c: 0.25768, h: 29.2339, alpha: 1 })).toBe('oklch(62.8% 0.2577 29.23)')
    expect(formatOklch({ l: 0.5, c: 0.1, h: 120, alpha: 0.25 })).toBe('oklch(50% 0.1 120 / 0.25)')
    expect(formatOklab({ l: 0.6, c: 0.1, h: 0, alpha: 1 })).toBe('oklab(60% 0.1 0)')
  })
})

describe('gamut', () => {
  it('counts the sRGB primaries as inside sRGB despite rounding', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000']) {
      expect(isInSrgb(parseColor(hex)!)).toBe(true)
    }
  })

  it('tells sRGB, Display P3 and wider colors apart', () => {
    const p3Only = parseColor('oklch(65% 0.28 30)')!
    expect(isInSrgb(p3Only)).toBe(false)
    expect(isInP3(p3Only)).toBe(true)

    const wider = parseColor('oklch(90% 0.37 145)')!
    expect(isInSrgb(wider)).toBe(false)
    expect(isInP3(wider)).toBe(false)
  })

  it('maps a color into sRGB by lowering chroma, keeping lightness and hue close', () => {
    const color = parseColor('oklch(70% 0.3 145)')!
    const mapped = toSrgbGamut(color)
    expect(isInSrgb(mapped)).toBe(true)
    expect(mapped.c).toBeLessThan(color.c)
    expect(mapped.l).toBeCloseTo(color.l, 1)
    expect(Math.abs(mapped.h - color.h)).toBeLessThan(5)
  })

  it('leaves an sRGB color as it is, and clamps lightness at the ends', () => {
    const color = parseColor('oklch(70% 0.1 250)')!
    expect(toSrgbGamut(color)).toBe(color)
    expect(toSrgbGamut({ l: 1, c: 0.3, h: 20, alpha: 1 }).c).toBe(0)
  })

  it('gives sRGB strings for the mapped color', () => {
    const srgb = toSrgbColord(parseColor('#65a1fe')!)
    expect(srgb.toHex()).toBe('#65a1fe')
    expect(srgb.toRgbString()).toBe('rgb(101, 161, 254)')
  })
})

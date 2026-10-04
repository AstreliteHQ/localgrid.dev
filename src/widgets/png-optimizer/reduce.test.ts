import { describe, expect, it } from 'vitest'
import type { RgbaImage } from './png'
import { planEncodings, reduceSampleDepth } from './reduce'

function rgba(pixels: number[][], depth: 8 | 16 = 8): RgbaImage {
  const flat = pixels.flat()
  return {
    width: pixels.length,
    height: 1,
    depth,
    data: depth === 16 ? Uint16Array.from(flat) : Uint8Array.from(flat),
  }
}

function direct(image: RgbaImage) {
  return planEncodings(image)[0]
}

describe('reduceSampleDepth', () => {
  it('drops to 8 bits when every sample repeats its byte', () => {
    const reduced = reduceSampleDepth(rgba([[0x1212, 0xffff, 0, 0xabab]], 16))
    expect(reduced.depth).toBe(8)
    expect([...reduced.data]).toEqual([0x12, 0xff, 0, 0xab])
  })

  it('keeps 16 bits when a single sample needs them', () => {
    expect(reduceSampleDepth(rgba([[0x1212, 0xffff, 0, 0xabac]], 16)).depth).toBe(16)
  })
})

describe('planEncodings', () => {
  it('drops an alpha channel that is fully opaque', () => {
    const encoding = direct(
      rgba([
        [10, 20, 30, 255],
        [40, 50, 60, 255],
      ]),
    )
    expect(encoding.colorType).toBe(2)
    expect(encoding.transparency).toBeNull()
  })

  it('keeps the alpha channel for a single translucent pixel', () => {
    expect(
      direct(
        rgba([
          [10, 20, 30, 255],
          [40, 50, 60, 254],
        ]),
      ).colorType,
    ).toBe(6)
  })

  it('uses a color key when every transparent pixel shares one unused color', () => {
    const encoding = direct(
      rgba([
        [10, 20, 30, 255],
        [1, 2, 3, 0],
        [1, 2, 3, 0],
      ]),
    )
    expect(encoding.colorType).toBe(2)
    expect([...encoding.transparency!]).toEqual([0, 1, 0, 2, 0, 3])
  })

  it('refuses a color key that an opaque pixel also uses', () => {
    expect(
      direct(
        rgba([
          [1, 2, 3, 255],
          [1, 2, 3, 0],
        ]),
      ).colorType,
    ).toBe(6)
  })

  it('refuses a color key when transparent pixels differ in color', () => {
    expect(
      direct(
        rgba([
          [9, 9, 9, 255],
          [1, 2, 3, 0],
          [4, 5, 6, 0],
        ]),
      ).colorType,
    ).toBe(6)
  })

  it('turns equal channels into grayscale', () => {
    expect(
      direct(
        rgba([
          [7, 7, 7, 255],
          [200, 200, 200, 255],
        ]),
      ).colorType,
    ).toBe(0)
    expect(
      direct(
        rgba([
          [7, 7, 7, 255],
          [200, 200, 200, 3],
        ]),
      ).colorType,
    ).toBe(4)
  })

  it('picks the smallest exact grayscale bit depth', () => {
    expect(
      direct(
        rgba([
          [0, 0, 0, 255],
          [255, 255, 255, 255],
        ]),
      ).bitDepth,
    ).toBe(1)
    expect(
      direct(
        rgba([
          [0, 0, 0, 255],
          [85, 85, 85, 255],
        ]),
      ).bitDepth,
    ).toBe(2)
    expect(
      direct(
        rgba([
          [17, 17, 17, 255],
          [34, 34, 34, 255],
        ]),
      ).bitDepth,
    ).toBe(4)
    expect(direct(rgba([[18, 18, 18, 255]])).bitDepth).toBe(8)
  })

  it('offers a palette for few colors, translucent entries first', () => {
    const encodings = planEncodings(
      rgba([
        [255, 0, 0, 255],
        [0, 255, 0, 128],
        [255, 0, 0, 255],
      ]),
    )
    const palette = encodings.find((encoding) => encoding.colorType === 3)!
    expect(palette.bitDepth).toBe(1)
    expect([...palette.palette!]).toEqual([0, 255, 0, 255, 0, 0])
    expect([...palette.transparency!]).toEqual([128])
    expect(palette.raw[0]).toBe(0b10100000)
  })

  it('offers no palette past 256 colors', () => {
    const pixels = Array.from({ length: 300 }, (_, index) => [index & 0xff, index >> 8, 0, 255])
    expect(planEncodings(rgba(pixels)).map((encoding) => encoding.colorType)).toEqual([2])
  })

  it('skips the palette when low-depth grayscale is already as small', () => {
    expect(
      planEncodings(
        rgba([
          [0, 0, 0, 255],
          [255, 255, 255, 255],
        ]),
      ).map((encoding) => encoding.colorType),
    ).toEqual([0])
  })
})

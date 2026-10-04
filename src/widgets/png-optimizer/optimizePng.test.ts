import { describe, expect, it } from 'vitest'
import { optimizePng } from './optimizePng'
import { buildPng, chunkTypes, decodePng, textChunk } from './testPng'
import type { BitDepth, ColorType } from './png'

const KEEP = { keepColorProfile: true }
const STRIP = { keepColorProfile: false }

/** Deterministic noise, so tests don't depend on Math.random. */
function noise(count: number, seed = 1): number[] {
  let state = seed
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state >> 16
  })
}

function expectSamePixels(before: Uint8Array, after: Uint8Array) {
  const a = decodePng(before)
  const b = decodePng(after)
  expect(b.width).toBe(a.width)
  expect(b.height).toBe(a.height)
  const scale = a.depth === b.depth ? 1 : 257
  const expanded = Array.from(b.data, (value) => value * scale)
  expect(expanded).toEqual(Array.from(a.data))
}

const W = 16
const H = 12

const fixtures: { name: string; colorType: ColorType; bitDepth: BitDepth; samples: number[] }[] = [
  {
    name: 'opaque RGBA',
    colorType: 6,
    bitDepth: 8,
    samples: Array.from({ length: W * H }, (_, i) => [(i % W) * 8, Math.floor(i / W) * 10, 99, 255]).flat(),
  },
  {
    name: 'translucent RGBA noise',
    colorType: 6,
    bitDepth: 8,
    samples: noise(W * H * 4).map((value) => value & 0xff),
  },
  {
    name: 'RGB that is really gray',
    colorType: 2,
    bitDepth: 8,
    samples: Array.from({ length: W * H }, (_, i) => [i, i, i]).flat(),
  },
  {
    name: '16-bit RGBA that fits in 8 bits',
    colorType: 6,
    bitDepth: 16,
    samples: Array.from({ length: W * H * 4 }, (_, i) => (i % 251) * 257),
  },
  {
    name: '16-bit gray that needs 16 bits',
    colorType: 0,
    bitDepth: 16,
    samples: noise(W * H, 7),
  },
  {
    name: 'few-color RGB',
    colorType: 2,
    bitDepth: 8,
    samples: Array.from({ length: W * H }, (_, i) => (i % 3 === 0 ? [255, 0, 0] : [0, 0, 255])).flat(),
  },
]

describe('optimizePng', () => {
  for (const fixture of fixtures) {
    for (const interlaced of [false, true]) {
      it(`keeps every pixel of ${fixture.name}${interlaced ? ' (interlaced)' : ''}`, () => {
        const input = buildPng({ width: W, height: H, interlaced, ...fixture })
        const result = optimizePng(input, KEEP)
        expect(result.bytes.length).toBeLessThanOrEqual(input.length)
        expectSamePixels(input, result.bytes)
      })
    }
  }

  it('reduces RGBA without transparency to a palette or RGB and writes it non-interlaced', () => {
    const input = buildPng({
      width: W,
      height: H,
      colorType: 6,
      bitDepth: 8,
      interlaced: true,
      samples: Array.from({ length: W * H }, (_, i) => (i % 2 ? [1, 2, 3, 255] : [4, 5, 6, 255])).flat(),
    })
    const result = optimizePng(input, KEEP)
    expect(result.before).toEqual({ colorType: 6, bitDepth: 8, interlaced: true })
    expect(result.after).toEqual({ colorType: 3, bitDepth: 1, interlaced: false })
    expect(result.filter).not.toBeNull()
    expect(result.alreadyOptimal).toBe(false)
  })

  it('strips text, time and EXIF chunks', () => {
    const input = buildPng({
      width: 2,
      height: 2,
      colorType: 0,
      bitDepth: 8,
      samples: [1, 2, 3, 4],
      chunks: [textChunk('tEXt', 'Software\0Some editor'), textChunk('tIME', '\x07\xea\x01\x01\0\0\0')],
      afterIdat: [textChunk('eXIf', 'MM\0*')],
    })
    const result = optimizePng(input, KEEP)
    expect(result.removedChunks.sort()).toEqual(['eXIf', 'tEXt', 'tIME'])
    expect(chunkTypes(result.bytes)).not.toContain('tEXt')
    expectSamePixels(input, result.bytes)
  })

  it('keeps color profile chunks and pHYs unless asked to strip the profile', () => {
    const input = buildPng({
      width: 2,
      height: 2,
      colorType: 2,
      bitDepth: 8,
      samples: noise(12, 3).map((value) => value & 0xff),
      chunks: [
        { type: 'gAMA', data: Uint8Array.of(0, 0, 0xb1, 0x8f) },
        { type: 'sRGB', data: Uint8Array.of(0) },
        { type: 'pHYs', data: Uint8Array.of(0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1) },
        textChunk('tEXt', 'Comment\0' + 'x'.repeat(200)),
      ],
    })
    const kept = chunkTypes(optimizePng(input, KEEP).bytes)
    expect(kept).toEqual(expect.arrayContaining(['gAMA', 'sRGB', 'pHYs']))
    const stripped = optimizePng(input, STRIP)
    expect(chunkTypes(stripped.bytes)).not.toContain('gAMA')
    expect(chunkTypes(stripped.bytes)).toContain('pHYs')
    expect(stripped.removedChunks).toEqual(expect.arrayContaining(['gAMA', 'sRGB']))
  })

  it('returns the original file untouched when nothing beats it', () => {
    const once = optimizePng(
      buildPng({ width: W, height: H, colorType: 6, bitDepth: 8, samples: fixtures[1].samples }),
      KEEP,
    )
    const again = optimizePng(once.bytes, KEEP)
    expect(again.alreadyOptimal).toBe(true)
    expect(again.bytes).toBe(once.bytes)
    expect(again.removedChunks).toEqual([])
  })

  it('only strips chunks from an animated PNG', () => {
    const actl = { type: 'acTL', data: Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 0) }
    const fctl = { type: 'fcTL', data: new Uint8Array(26) }
    const input = buildPng({
      width: 2,
      height: 1,
      colorType: 6,
      bitDepth: 8,
      samples: [1, 2, 3, 255, 4, 5, 6, 255],
      chunks: [actl, fctl, textChunk('tEXt', 'Comment\0hello there')],
    })
    const result = optimizePng(input, KEEP)
    expect(result.animated).toBe(true)
    expect(result.filter).toBeNull()
    expect(chunkTypes(result.bytes)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'IEND'])
  })

  it('rejects an unknown critical chunk', () => {
    const input = buildPng({
      width: 1,
      height: 1,
      colorType: 0,
      bitDepth: 8,
      samples: [0],
      chunks: [textChunk('ZZZZ', '')],
    })
    expect(() => optimizePng(input, KEEP)).toThrow(/unsupported ZZZZ chunk/)
  })

  it('rejects corrupt image data', () => {
    const input = buildPng({ width: 4, height: 4, colorType: 0, bitDepth: 8, samples: new Array(16).fill(0) })
    // Swap in an IDAT whose stream is too short for a 4x4 image.
    const short = buildPng({ width: 1, height: 1, colorType: 0, bitDepth: 8, samples: [0] })
    const patched = Uint8Array.from([...input.subarray(0, 33), ...short.subarray(33)])
    expect(() => optimizePng(patched, KEEP)).toThrow(/missing image data/)
  })
})

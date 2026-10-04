import { describe, expect, it } from 'vitest'
import { crc32, filterRow, parseHeader, readChunks, unfilterRow, writeChunks } from './png'
import { buildPng, decodePng, textChunk } from './testPng'

describe('crc32', () => {
  it('matches the reference value for IEND', () => {
    const iend = Uint8Array.from('IEND', (char) => char.charCodeAt(0))
    expect((crc32(iend) ^ 0xffffffff) >>> 0).toBe(0xae426082)
  })
})

describe('readChunks / writeChunks', () => {
  it('round trips a file byte for byte', () => {
    const png = buildPng({
      width: 1,
      height: 1,
      colorType: 0,
      bitDepth: 8,
      samples: [7],
      chunks: [textChunk('tEXt', 'a\0b')],
    })
    expect(writeChunks(readChunks(png))).toEqual(png)
  })

  it('rejects a file that is not a PNG', () => {
    expect(() => readChunks(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0))).toThrow(/not a PNG/)
  })

  it('rejects a corrupted checksum', () => {
    const png = buildPng({ width: 1, height: 1, colorType: 0, bitDepth: 8, samples: [7] })
    png[29] ^= 0xff // last byte of the IHDR CRC
    expect(() => readChunks(png)).toThrow(/checksum/)
  })

  it('rejects a truncated file', () => {
    const png = buildPng({ width: 1, height: 1, colorType: 0, bitDepth: 8, samples: [7] })
    expect(() => readChunks(png.subarray(0, png.length - 6))).toThrow(/truncated/)
  })
})

describe('parseHeader', () => {
  it('rejects an invalid color type and bit depth pair', () => {
    const data = Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 1, 4, 2, 0, 0, 0)
    expect(() => parseHeader(data)).toThrow(/invalid color type/)
  })
})

describe('filterRow / unfilterRow', () => {
  const prev = Uint8Array.of(10, 200, 30, 40, 250, 6)
  const row = Uint8Array.of(12, 199, 255, 0, 128, 77)
  for (const type of [0, 1, 2, 3, 4]) {
    it(`round trips filter type ${type}`, () => {
      const filtered = new Uint8Array(row.length)
      filterRow(type, row, prev, 3, filtered)
      unfilterRow(type, filtered, prev, 3)
      expect(filtered).toEqual(row)
    })
    it(`round trips filter type ${type} on a first row`, () => {
      const filtered = new Uint8Array(row.length)
      filterRow(type, row, null, 2, filtered)
      unfilterRow(type, filtered, null, 2)
      expect(filtered).toEqual(row)
    })
  }
})

describe('decodeImage', () => {
  it('scales low-depth grayscale to the full range', () => {
    const image = decodePng(buildPng({ width: 4, height: 1, colorType: 0, bitDepth: 2, samples: [0, 1, 2, 3] }))
    expect([...image.data]).toEqual([0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 255, 255, 255, 255, 255])
  })

  it('expands a palette with its tRNS alphas', () => {
    const image = decodePng(
      buildPng({
        width: 2,
        height: 1,
        colorType: 3,
        bitDepth: 1,
        samples: [1, 0],
        palette: [255, 0, 0, 0, 0, 255],
        transparency: [128],
      }),
    )
    expect([...image.data]).toEqual([0, 0, 255, 255, 255, 0, 0, 128])
  })

  it('applies an RGB color key', () => {
    const image = decodePng(
      buildPng({
        width: 2,
        height: 1,
        colorType: 2,
        bitDepth: 8,
        samples: [1, 2, 3, 4, 5, 6],
        transparency: [0, 1, 0, 2, 0, 3],
      }),
    )
    expect([...image.data]).toEqual([1, 2, 3, 0, 4, 5, 6, 255])
  })

  it('reassembles an Adam7 interlaced image', () => {
    const width = 9
    const height = 9
    const samples = Array.from({ length: width * height }, (_, index) => index)
    const plain = decodePng(buildPng({ width, height, colorType: 0, bitDepth: 8, samples }))
    const interlaced = decodePng(buildPng({ width, height, colorType: 0, bitDepth: 8, samples, interlaced: true }))
    expect(interlaced.data).toEqual(plain.data)
    expect(interlaced.data[(4 * width + 7) * 4]).toBe(4 * width + 7)
  })

  it('keeps all 16 bits of a 16-bit image', () => {
    const image = decodePng(buildPng({ width: 1, height: 1, colorType: 4, bitDepth: 16, samples: [0x1234, 0xabcd] }))
    expect(image.depth).toBe(16)
    expect([...image.data]).toEqual([0x1234, 0x1234, 0x1234, 0xabcd])
  })

  it('rejects a palette index past the end of the palette', () => {
    const png = buildPng({ width: 1, height: 1, colorType: 3, bitDepth: 8, samples: [3], palette: [0, 0, 0] })
    expect(() => decodePng(png)).toThrow(/missing from its palette/)
  })
})

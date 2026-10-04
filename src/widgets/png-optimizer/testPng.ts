/** Test-only PNG builder: writes images in any color type, bit depth and
 * interlace mode from plain sample arrays, so the optimizer's tests can
 * cover layouts no canvas would produce. Kept deliberately naive (filter 0,
 * straightforward packing) so it shares as little logic as possible with
 * the code under test. */

import { unzlibSync, zlibSync } from 'fflate'
import {
  decodeImage,
  encodeHeader,
  parseHeader,
  readChunks,
  writeChunks,
  type BitDepth,
  type ColorType,
  type PngChunk,
  type RgbaImage,
} from './png'

export interface TestPngSpec {
  width: number
  height: number
  colorType: ColorType
  bitDepth: BitDepth
  interlaced?: boolean
  /** Raw samples, row-major, `channels` per pixel, at the file's bit depth. */
  samples: number[]
  palette?: number[]
  transparency?: number[]
  /** Extra chunks inserted right after IHDR. */
  chunks?: PngChunk[]
  /** Extra chunks inserted after IDAT. */
  afterIdat?: PngChunk[]
}

const CHANNELS: Record<ColorType, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
]

function packRow(values: number[], bitDepth: BitDepth): number[] {
  if (bitDepth === 16) return values.flatMap((value) => [value >> 8, value & 0xff])
  if (bitDepth === 8) return values
  const bytes = new Array(Math.ceil((values.length * bitDepth) / 8)).fill(0)
  values.forEach((value, index) => {
    const bit = index * bitDepth
    bytes[bit >> 3] |= value << (8 - bitDepth - (bit % 8))
  })
  return bytes
}

export function textChunk(type: string, text: string): PngChunk {
  return { type, data: Uint8Array.from(text, (char) => char.charCodeAt(0)) }
}

export function buildPng(spec: TestPngSpec): Uint8Array {
  const { width, height, colorType, bitDepth } = spec
  const channels = CHANNELS[colorType]
  const pixel = (x: number, y: number) => spec.samples.slice((y * width + x) * channels, (y * width + x + 1) * channels)
  const passes = spec.interlaced ? ADAM7 : [[0, 0, 1, 1]]
  const stream: number[] = []
  for (const [x0, y0, dx, dy] of passes) {
    for (let y = y0; y < height; y += dy) {
      const values: number[] = []
      for (let x = x0; x < width; x += dx) values.push(...pixel(x, y))
      if (values.length === 0) continue
      stream.push(0, ...packRow(values, bitDepth))
    }
  }
  const chunks: PngChunk[] = [
    { type: 'IHDR', data: encodeHeader({ width, height, colorType, bitDepth, interlaced: !!spec.interlaced }) },
    ...(spec.chunks ?? []),
  ]
  if (spec.palette) chunks.push({ type: 'PLTE', data: Uint8Array.from(spec.palette) })
  if (spec.transparency) chunks.push({ type: 'tRNS', data: Uint8Array.from(spec.transparency) })
  chunks.push({ type: 'IDAT', data: zlibSync(Uint8Array.from(stream), { level: 0 }) })
  chunks.push(...(spec.afterIdat ?? []))
  chunks.push({ type: 'IEND', data: new Uint8Array(0) })
  return writeChunks(chunks)
}

/** Decodes a whole PNG file to RGBA, for comparing pixels before and after. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const chunks = readChunks(bytes)
  const idat = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => [...chunk.data])
  return decodeImage(unzlibSync(Uint8Array.from(idat.flat())), {
    header: parseHeader(chunks[0].data),
    palette: chunks.find((chunk) => chunk.type === 'PLTE')?.data ?? null,
    transparency: chunks.find((chunk) => chunk.type === 'tRNS')?.data ?? null,
  })
}

export function chunkTypes(bytes: Uint8Array): string[] {
  return readChunks(bytes).map((chunk) => chunk.type)
}

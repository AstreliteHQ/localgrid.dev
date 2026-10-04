/** Minimal PNG codec for the PNG Optimizer widget: chunk reading and
 * writing, scanline filtering, Adam7 deinterlacing and decoding to a flat
 * RGBA buffer. Pure functions over byte arrays, no DOM, so the whole thing
 * runs inside a Web Worker and under Vitest alike.
 *
 * Compression is not handled here: callers pass already inflated image data
 * in and get raw filtered scanlines out, so the deflate engine stays a
 * single, swappable choice in optimizePng.ts. */

export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

export interface PngChunk {
  type: string
  data: Uint8Array
}

export type ColorType = 0 | 2 | 3 | 4 | 6
export type BitDepth = 1 | 2 | 4 | 8 | 16

export interface PngHeader {
  width: number
  height: number
  bitDepth: BitDepth
  colorType: ColorType
  interlaced: boolean
}

/** Decoded pixels, always four samples per pixel in R, G, B, A order.
 * Sources of 8 bits or less land in a Uint8Array (low bit depths scaled up
 * to the full 0..255 range, the way a viewer renders them); 16-bit sources
 * keep every bit in a Uint16Array. */
export interface RgbaImage {
  width: number
  height: number
  depth: 8 | 16
  data: Uint8Array | Uint16Array
}

/** Largest image the optimizer decodes. Every candidate layout keeps a copy
 * of the scanlines in memory, so this keeps a worker well clear of browser
 * memory limits; it is also what stops a tiny crafted file from declaring
 * enormous dimensions. */
export const MAX_PIXELS = 40_000_000

const CHANNELS: Record<ColorType, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

const VALID_DEPTHS: Record<ColorType, readonly BitDepth[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
}

export const COLOR_TYPE_LABELS: Record<ColorType, string> = {
  0: 'Grayscale',
  2: 'RGB',
  3: 'Indexed',
  4: 'Grayscale + alpha',
  6: 'RGBA',
}

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  return crcTable
}

/** CRC-32 as PNG uses it, computed over the chunk type and data. */
export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  const table = getCrcTable()
  let c = crc
  for (let i = 0; i < bytes.length; i += 1) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return c
}

function typeBytes(type: string): Uint8Array {
  return Uint8Array.from(type, (char) => char.charCodeAt(0))
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/** Splits a PNG into its chunks, checking the signature and every CRC. A
 * corrupt file is rejected rather than "optimized" into a different image. */
export function readChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error('This file is not a PNG.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE.length
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('This PNG is truncated.')
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > bytes.length) throw new Error('This PNG is truncated.')
    const typeAndData = bytes.subarray(offset + 4, offset + 8 + length)
    const type = String.fromCharCode(...typeAndData.subarray(0, 4))
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('This PNG has a malformed chunk.')
    const expected = view.getUint32(offset + 8 + length)
    if ((crc32(typeAndData) ^ 0xffffffff) >>> 0 !== expected) {
      throw new Error(`This PNG is corrupt (bad checksum in its ${type} chunk).`)
    }
    chunks.push({ type, data: typeAndData.subarray(4) })
    offset = end
    if (type === 'IEND') break
  }
  if (chunks[0]?.type !== 'IHDR') throw new Error('This PNG has no IHDR header.')
  if (chunks[chunks.length - 1].type !== 'IEND') throw new Error('This PNG is truncated.')
  return chunks
}

export function writeChunks(chunks: PngChunk[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + 12 + chunk.data.length, PNG_SIGNATURE.length)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out.set(PNG_SIGNATURE, 0)
  let offset = PNG_SIGNATURE.length
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.length)
    out.set(typeBytes(chunk.type), offset + 4)
    out.set(chunk.data, offset + 8)
    const crc = crc32(out.subarray(offset + 4, offset + 8 + chunk.data.length)) ^ 0xffffffff
    view.setUint32(offset + 8 + chunk.data.length, crc >>> 0)
    offset += 12 + chunk.data.length
  }
  return out
}

export function parseHeader(data: Uint8Array): PngHeader {
  if (data.length !== 13) throw new Error('This PNG has a malformed IHDR header.')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint32(0)
  const height = view.getUint32(4)
  const bitDepth = data[8] as BitDepth
  const colorType = data[9] as ColorType
  if (!(colorType in CHANNELS) || !VALID_DEPTHS[colorType].includes(bitDepth)) {
    throw new Error('This PNG uses an invalid color type and bit depth combination.')
  }
  if (width === 0 || height === 0) throw new Error('This PNG has no pixels.')
  if (data[10] !== 0 || data[11] !== 0 || data[12] > 1) throw new Error('This PNG uses an unsupported encoding.')
  return { width, height, bitDepth, colorType, interlaced: data[12] === 1 }
}

export function encodeHeader(header: PngHeader): Uint8Array {
  const data = new Uint8Array(13)
  const view = new DataView(data.buffer)
  view.setUint32(0, header.width)
  view.setUint32(4, header.height)
  data[8] = header.bitDepth
  data[9] = header.colorType
  data[12] = header.interlaced ? 1 : 0
  return data
}

export function bitsPerPixel(colorType: ColorType, bitDepth: BitDepth): number {
  return CHANNELS[colorType] * bitDepth
}

/** Bytes per row of packed samples, without the leading filter byte. */
export function rowStride(width: number, colorType: ColorType, bitDepth: BitDepth): number {
  return Math.ceil((width * bitsPerPixel(colorType, bitDepth)) / 8)
}

/** The "bpp" the filters compare against: bytes per complete pixel, rounded
 * up to 1 for sub-byte depths. */
export function filterUnit(colorType: ColorType, bitDepth: BitDepth): number {
  return Math.max(1, bitsPerPixel(colorType, bitDepth) >> 3)
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Reverses one scanline's filter in place. `prev` is the previous
 * unfiltered row, or null for the first row of an image or pass. */
export function unfilterRow(type: number, row: Uint8Array, prev: Uint8Array | null, unit: number): void {
  const length = row.length
  switch (type) {
    case 0:
      return
    case 1:
      for (let i = unit; i < length; i += 1) row[i] = (row[i] + row[i - unit]) & 0xff
      return
    case 2:
      if (prev) for (let i = 0; i < length; i += 1) row[i] = (row[i] + prev[i]) & 0xff
      return
    case 3:
      for (let i = 0; i < length; i += 1) {
        const left = i >= unit ? row[i - unit] : 0
        const up = prev ? prev[i] : 0
        row[i] = (row[i] + ((left + up) >> 1)) & 0xff
      }
      return
    case 4:
      for (let i = 0; i < length; i += 1) {
        const left = i >= unit ? row[i - unit] : 0
        const up = prev ? prev[i] : 0
        const upLeft = prev && i >= unit ? prev[i - unit] : 0
        row[i] = (row[i] + paeth(left, up, upLeft)) & 0xff
      }
      return
    default:
      throw new Error(`This PNG uses an unknown filter type (${type}).`)
  }
}

/** Applies filter `type` to one scanline, writing into `out` (same length
 * as `row`). The inverse of unfilterRow. */
export function filterRow(type: number, row: Uint8Array, prev: Uint8Array | null, unit: number, out: Uint8Array): void {
  const length = row.length
  for (let i = 0; i < length; i += 1) {
    const left = i >= unit ? row[i - unit] : 0
    const up = prev ? prev[i] : 0
    let predictor = 0
    if (type === 1) predictor = left
    else if (type === 2) predictor = up
    else if (type === 3) predictor = (left + up) >> 1
    else if (type === 4) predictor = paeth(left, up, prev && i >= unit ? prev[i - unit] : 0)
    out[i] = (row[i] - predictor) & 0xff
  }
}

/** Adam7 passes as [x start, y start, x step, y step]. */
const ADAM7: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
]

interface Pass {
  x0: number
  y0: number
  dx: number
  dy: number
  width: number
  height: number
}

function passesFor(header: PngHeader): Pass[] {
  if (!header.interlaced) {
    return [{ x0: 0, y0: 0, dx: 1, dy: 1, width: header.width, height: header.height }]
  }
  return ADAM7.map(([x0, y0, dx, dy]) => ({
    x0,
    y0,
    dx,
    dy,
    width: Math.ceil(Math.max(0, header.width - x0) / dx),
    height: Math.ceil(Math.max(0, header.height - y0) / dy),
  }))
}

function readSample(row: Uint8Array, index: number, bitDepth: BitDepth): number {
  switch (bitDepth) {
    case 16:
      return (row[index * 2] << 8) | row[index * 2 + 1]
    case 8:
      return row[index]
    default: {
      const bitOffset = index * bitDepth
      const shift = 8 - bitDepth - (bitOffset & 7)
      return (row[bitOffset >> 3] >> shift) & ((1 << bitDepth) - 1)
    }
  }
}

export interface DecodeContext {
  header: PngHeader
  /** PLTE contents, 3 bytes per entry. */
  palette: Uint8Array | null
  /** tRNS contents, interpreted according to the color type. */
  transparency: Uint8Array | null
}

/** Turns inflated IDAT bytes into RGBA pixels. */
export function decodeImage(inflated: Uint8Array, context: DecodeContext): RgbaImage {
  const { header, palette, transparency } = context
  const { width, height, bitDepth, colorType } = header
  const depth = bitDepth === 16 ? 16 : 8
  const pixelCount = width * height
  if (pixelCount > MAX_PIXELS) throw new Error('This PNG is too large to optimize.')
  const passes = passesFor(header)
  const expected = passes.reduce(
    (sum, pass) =>
      pass.width && pass.height ? sum + (1 + rowStride(pass.width, colorType, bitDepth)) * pass.height : sum,
    0,
  )
  if (inflated.length < expected) throw new Error('This PNG is missing image data.')
  const data = depth === 16 ? new Uint16Array(pixelCount * 4) : new Uint8Array(pixelCount * 4)
  const max = depth === 16 ? 0xffff : 0xff
  const unit = filterUnit(colorType, bitDepth)
  const channels = CHANNELS[colorType]
  // Low-depth grayscale renders scaled to the full range: 1 bit to 0/255,
  // 2 bits to multiples of 85, 4 bits to multiples of 17.
  const grayScale = colorType === 0 && bitDepth < 8 ? 255 / ((1 << bitDepth) - 1) : 1

  if (colorType === 3 && !palette) throw new Error('This indexed PNG has no palette.')
  const paletteSize = palette ? palette.length / 3 : 0

  let keyGray = -1
  let keyR = -1
  let keyG = -1
  let keyB = -1
  if (transparency && colorType === 0 && transparency.length >= 2) {
    keyGray = (transparency[0] << 8) | transparency[1]
  }
  if (transparency && colorType === 2 && transparency.length >= 6) {
    keyR = (transparency[0] << 8) | transparency[1]
    keyG = (transparency[2] << 8) | transparency[3]
    keyB = (transparency[4] << 8) | transparency[5]
  }

  let offset = 0
  for (const pass of passes) {
    if (pass.width === 0 || pass.height === 0) continue
    const stride = rowStride(pass.width, colorType, bitDepth)
    let prev: Uint8Array | null = null
    for (let y = 0; y < pass.height; y += 1) {
      if (offset + 1 + stride > inflated.length) throw new Error('This PNG is missing image data.')
      const filter = inflated[offset]
      const row = inflated.slice(offset + 1, offset + 1 + stride)
      offset += 1 + stride
      unfilterRow(filter, row, prev, unit)
      prev = row
      const destY = pass.y0 + y * pass.dy
      for (let x = 0; x < pass.width; x += 1) {
        const dest = (destY * width + pass.x0 + x * pass.dx) * 4
        const base = x * channels
        let r: number, g: number, b: number, a: number
        switch (colorType) {
          case 0: {
            const raw = readSample(row, base, bitDepth)
            r = g = b = Math.round(raw * grayScale)
            a = raw === keyGray ? 0 : max
            break
          }
          case 2:
            r = readSample(row, base, bitDepth)
            g = readSample(row, base + 1, bitDepth)
            b = readSample(row, base + 2, bitDepth)
            a = r === keyR && g === keyG && b === keyB ? 0 : max
            break
          case 3: {
            const index = readSample(row, base, bitDepth)
            if (index >= paletteSize) throw new Error('This PNG references a color missing from its palette.')
            r = palette![index * 3]
            g = palette![index * 3 + 1]
            b = palette![index * 3 + 2]
            a = transparency && index < transparency.length ? transparency[index] : 255
            break
          }
          case 4:
            r = g = b = readSample(row, base, bitDepth)
            a = readSample(row, base + 1, bitDepth)
            break
          case 6:
            r = readSample(row, base, bitDepth)
            g = readSample(row, base + 1, bitDepth)
            b = readSample(row, base + 2, bitDepth)
            a = readSample(row, base + 3, bitDepth)
            break
        }
        data[dest] = r
        data[dest + 1] = g
        data[dest + 2] = b
        data[dest + 3] = a
      }
    }
  }
  return { width, height, depth, data }
}

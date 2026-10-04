/** Lossless color type and bit depth reduction for the PNG Optimizer.
 *
 * Every reduction here is exact: it only applies when the smaller layout
 * can represent every pixel of the decoded image bit for bit, so the image
 * a viewer renders is unchanged. Fully transparent pixels keep their color
 * values too, even though nobody can see them. */

import { rowStride, type BitDepth, type ColorType, type RgbaImage } from './png'

/** One way to lay the image out in a PNG, ready to be filtered and
 * compressed. */
export interface Encoding {
  colorType: ColorType
  bitDepth: BitDepth
  /** PLTE contents for indexed encodings. */
  palette: Uint8Array | null
  /** tRNS contents, if any. */
  transparency: Uint8Array | null
  width: number
  height: number
  /** Packed, unfiltered scanlines, `height` rows of `stride` bytes. */
  raw: Uint8Array
  stride: number
}

type AlphaMode = 'opaque' | 'key' | 'full'

interface Analysis {
  gray: boolean
  alpha: AlphaMode
  /** RGB of every transparent pixel, when alpha is 'key'. */
  key: [number, number, number] | null
  /** Distinct RGBA colors and their pixel counts, or null past 256. Only
   * collected for 8-bit images, since a palette is 8-bit only. */
  colors: Map<number, number> | null
}

/** Drops 16-bit samples to 8 bits when every sample's high and low bytes
 * match, which is exactly the set of 16-bit values an 8-bit value expands
 * to. Returns the image unchanged otherwise. */
export function reduceSampleDepth(image: RgbaImage): RgbaImage {
  if (image.depth === 8) return image
  const source = image.data
  for (let i = 0; i < source.length; i += 1) if (source[i] % 257 !== 0) return image
  const data = new Uint8Array(source.length)
  for (let i = 0; i < source.length; i += 1) data[i] = source[i] / 257
  return { width: image.width, height: image.height, depth: 8, data }
}

function analyze(image: RgbaImage): Analysis {
  const { data, depth } = image
  const max = depth === 16 ? 0xffff : 0xff
  let gray = true
  let alpha: AlphaMode = 'opaque'
  let key: [number, number, number] | null = null
  let colors: Map<number, number> | null = depth === 8 ? new Map() : null

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (gray && (r !== g || g !== b)) gray = false
    if (a !== max && alpha !== 'full') {
      if (a !== 0) alpha = 'full'
      else if (!key) {
        key = [r, g, b]
        alpha = 'key'
      } else if (key[0] !== r || key[1] !== g || key[2] !== b) alpha = 'full'
    }
    if (colors) {
      const id = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
      colors.set(id, (colors.get(id) ?? 0) + 1)
      if (colors.size > 256) colors = null
    }
  }

  // A color key only works if no opaque pixel shares the transparent color.
  if (alpha === 'key' && key) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === max && data[i] === key[0] && data[i + 1] === key[1] && data[i + 2] === key[2]) {
        alpha = 'full'
        break
      }
    }
  }
  if (alpha !== 'key') key = null
  return { gray, alpha, key, colors }
}

function writeSample(row: Uint8Array, index: number, bitDepth: BitDepth, value: number): void {
  switch (bitDepth) {
    case 16:
      row[index * 2] = value >> 8
      row[index * 2 + 1] = value & 0xff
      return
    case 8:
      row[index] = value
      return
    default: {
      const bitOffset = index * bitDepth
      row[bitOffset >> 3] |= value << (8 - bitDepth - (bitOffset & 7))
    }
  }
}

/** Smallest grayscale bit depth that holds every 8-bit gray value exactly.
 * A d-bit gray value v renders as v * 255 / (2^d - 1). */
function smallestGrayDepth(image: RgbaImage): BitDepth {
  const seen = new Uint8Array(256)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) seen[data[i]] = 1
  for (const depth of [1, 2, 4] as const) {
    const step = 255 / ((1 << depth) - 1)
    let fits = true
    for (let value = 0; value < 256 && fits; value += 1) if (seen[value] && value % step !== 0) fits = false
    if (fits) return depth
  }
  return 8
}

function directEncoding(image: RgbaImage, analysis: Analysis): Encoding {
  const { width, height, data, depth } = image
  const fullAlpha = analysis.alpha === 'full'
  const colorType: ColorType = analysis.gray ? (fullAlpha ? 4 : 0) : fullAlpha ? 6 : 2
  const bitDepth: BitDepth = colorType === 0 && depth === 8 ? smallestGrayDepth(image) : depth
  const scale = colorType === 0 && bitDepth < 8 ? 255 / ((1 << bitDepth) - 1) : 1
  const stride = rowStride(width, colorType, bitDepth)
  const raw = new Uint8Array(stride * height)

  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride)
    let index = 0
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4
      if (colorType === 0 || colorType === 4) writeSample(row, index++, bitDepth, data[p] / scale)
      else {
        writeSample(row, index++, bitDepth, data[p])
        writeSample(row, index++, bitDepth, data[p + 1])
        writeSample(row, index++, bitDepth, data[p + 2])
      }
      if (fullAlpha) writeSample(row, index++, bitDepth, data[p + 3])
    }
  }

  let transparency: Uint8Array | null = null
  if (analysis.key) {
    const [r, g, b] = analysis.key
    transparency =
      colorType === 0 ? Uint8Array.of(0, 0) : Uint8Array.of(r >> 8, r & 0xff, g >> 8, g & 0xff, b >> 8, b & 0xff)
    if (colorType === 0) new DataView(transparency.buffer).setUint16(0, r / scale)
  }
  return { colorType, bitDepth, palette: null, transparency, width, height, raw, stride }
}

function paletteEncoding(image: RgbaImage, colors: Map<number, number>): Encoding {
  const { width, height, data } = image
  // Translucent entries first, so the tRNS chunk can stop at the last one;
  // then by frequency, which tends to help the compressor a little.
  const entries = [...colors.entries()].sort(([idA, countA], [idB, countB]) => {
    const opaqueA = (idA & 0xff) === 0xff ? 1 : 0
    const opaqueB = (idB & 0xff) === 0xff ? 1 : 0
    return opaqueA - opaqueB || countB - countA || idA - idB
  })
  const size = entries.length
  const bitDepth: BitDepth = size <= 2 ? 1 : size <= 4 ? 2 : size <= 16 ? 4 : 8
  const palette = new Uint8Array(size * 3)
  const alphas = new Uint8Array(size)
  const lookup = new Map<number, number>()
  entries.forEach(([id], index) => {
    palette[index * 3] = id >>> 24
    palette[index * 3 + 1] = (id >>> 16) & 0xff
    palette[index * 3 + 2] = (id >>> 8) & 0xff
    alphas[index] = id & 0xff
    lookup.set(id, index)
  })
  let translucent = 0
  while (translucent < size && alphas[translucent] !== 0xff) translucent += 1

  const stride = rowStride(width, 3, bitDepth)
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4
      const id = ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0
      writeSample(row, x, bitDepth, lookup.get(id)!)
    }
  }
  return {
    colorType: 3,
    bitDepth,
    palette,
    transparency: translucent > 0 ? alphas.slice(0, translucent) : null,
    width,
    height,
    raw,
    stride,
  }
}

/** Every exact layout worth trying for this image: the smallest direct
 * (grayscale or RGB, with or without alpha) layout, plus an indexed one
 * when the image has 256 colors or fewer. Which compresses better depends
 * on the image, so both are kept for the caller to compare. */
export function planEncodings(decoded: RgbaImage): Encoding[] {
  const image = reduceSampleDepth(decoded)
  const analysis = analyze(image)
  const encodings = [directEncoding(image, analysis)]
  const direct = encodings[0]
  // A low-depth grayscale image is already as small as a palette would be.
  const grayAlreadyTiny = direct.colorType === 0 && direct.bitDepth < 8
  if (analysis.colors && !grayAlreadyTiny) encodings.push(paletteEncoding(image, analysis.colors))
  return encodings
}

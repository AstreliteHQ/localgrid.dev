/** Lossless PNG optimization pipeline.
 *
 * 1. Drop chunks that carry no pixels (text, timestamps, EXIF, ...), and
 *    optionally the color profile chunks too.
 * 2. Decode the pixels and lay them out in the smallest exact color type and
 *    bit depth (see reduce.ts), written non-interlaced.
 * 3. Try every scanline filter strategy, compress each at deflate level 9,
 *    and keep the smallest.
 * 4. Never return something larger than the input: the original file comes
 *    back untouched when nothing beats it.
 *
 * Synchronous and DOM-free, so it runs inside a Web Worker. */

import { unzlibSync, zlibSync } from 'fflate'
import { planEncodings, type Encoding } from './reduce'
import {
  decodeImage,
  encodeHeader,
  MAX_PIXELS,
  filterRow,
  filterUnit,
  parseHeader,
  readChunks,
  writeChunks,
  type BitDepth,
  type ColorType,
  type PngChunk,
} from './png'

export interface OptimizeOptions {
  /** Keep iCCP, sRGB, gAMA and cHRM. Removing them can change how a
   * color-managed viewer renders the image, so they are kept by default. */
  keepColorProfile: boolean
}

export interface PngLayout {
  colorType: ColorType
  bitDepth: BitDepth
  interlaced: boolean
}

export interface OptimizeResult {
  bytes: Uint8Array
  originalSize: number
  /** True when nothing could be saved and `bytes` is the input itself. */
  alreadyOptimal: boolean
  /** Animated PNGs only get their chunks stripped; frames are untouched. */
  animated: boolean
  /** Chunk types removed from the output, deduplicated. */
  removedChunks: string[]
  before: PngLayout
  after: PngLayout
  /** Filter strategy of the re-encoded image data, or null when the
   * original image data was kept. */
  filter: FilterStrategy | null
}

export type FilterStrategy = 'None' | 'Sub' | 'Up' | 'Average' | 'Paeth' | 'Adaptive'

const STRATEGIES: { name: FilterStrategy; type: number | null }[] = [
  { name: 'None', type: 0 },
  { name: 'Sub', type: 1 },
  { name: 'Up', type: 2 },
  { name: 'Average', type: 3 },
  { name: 'Paeth', type: 4 },
  { name: 'Adaptive', type: null },
]

const COLOR_PROFILE_CHUNKS = new Set(['iCCP', 'sRGB', 'gAMA', 'cHRM'])
/** Ancillary chunks that survive optimization. pHYs is the only one besides
 * the color profile: it sets the print size and DPI, which people notice. */
const KEPT_CHUNKS = new Set(['pHYs'])
const ANIMATION_CHUNKS = new Set(['acTL', 'fcTL', 'fdAT'])
const CRITICAL_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND'])

/** Above this much raw scanline data, filter strategies are compared with a
 * fast deflate level first and only the two best are recompressed at level
 * 9. Below it every candidate gets level 9 directly. */
const SCREENING_THRESHOLD = 2 * 1024 * 1024

function isCritical(type: string): boolean {
  return type.charCodeAt(0) < 97
}

function keepAncillary(type: string, options: OptimizeOptions, animated: boolean): boolean {
  if (KEPT_CHUNKS.has(type)) return true
  if (COLOR_PROFILE_CHUNKS.has(type)) return options.keepColorProfile
  if (animated && ANIMATION_CHUNKS.has(type)) return true
  return false
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function signedCost(bytes: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 1) sum += bytes[i] < 128 ? bytes[i] : 256 - bytes[i]
  return sum
}

/** Filters every scanline of an encoding with one strategy, producing the
 * byte stream that goes into IDAT before compression. "Adaptive" picks the
 * filter per row with the minimum sum of absolute differences heuristic
 * from the PNG specification. */
export function filterScanlines(encoding: Encoding, strategy: number | null): Uint8Array {
  const { raw, stride, height } = encoding
  const unit = filterUnit(encoding.colorType, encoding.bitDepth)
  const out = new Uint8Array(height * (stride + 1))
  const scratch = strategy === null ? [0, 1, 2, 3, 4].map(() => new Uint8Array(stride)) : []
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null
    const offset = y * (stride + 1)
    if (strategy !== null) {
      out[offset] = strategy
      filterRow(strategy, row, prev, unit, out.subarray(offset + 1, offset + 1 + stride))
      continue
    }
    let best = 0
    let bestCost = Infinity
    for (let type = 0; type < 5; type += 1) {
      filterRow(type, row, prev, unit, scratch[type])
      const cost = signedCost(scratch[type])
      if (cost < bestCost) {
        bestCost = cost
        best = type
      }
    }
    out[offset] = best
    out.set(scratch[best], offset + 1)
  }
  return out
}

function deflate(data: Uint8Array, level: 4 | 9): Uint8Array {
  return zlibSync(data, { level, mem: 12 })
}

interface Candidate {
  encoding: Encoding
  strategy: (typeof STRATEGIES)[number]
  filtered: Uint8Array
  compressed: Uint8Array
}

function bestCandidate(encodings: Encoding[]): Candidate {
  const rawTotal = encodings.reduce((sum, encoding) => sum + encoding.raw.length, 0) * STRATEGIES.length
  const level = rawTotal > SCREENING_THRESHOLD ? 4 : 9
  const keep = level === 9 ? 1 : 2
  // Only the leaders are held on to, so a large image doesn't keep a dozen
  // copies of its scanlines alive at once.
  let leaders: Candidate[] = []
  for (const encoding of encodings) {
    for (const strategy of STRATEGIES) {
      const filtered = filterScanlines(encoding, strategy.type)
      leaders.push({ encoding, strategy, filtered, compressed: deflate(filtered, level) })
      leaders = leaders.sort((a, b) => a.compressed.length - b.compressed.length).slice(0, keep)
    }
  }
  if (level === 9) return leaders[0]
  const finalists = leaders.map((candidate) => ({
    ...candidate,
    compressed: deflate(candidate.filtered, 9),
  }))
  return finalists.sort((a, b) => a.compressed.length - b.compressed.length)[0]
}

export function optimizePng(input: Uint8Array, options: OptimizeOptions): OptimizeResult {
  const chunks = readChunks(input)
  const header = parseHeader(chunks[0].data)
  const before: PngLayout = { colorType: header.colorType, bitDepth: header.bitDepth, interlaced: header.interlaced }
  const unknownCritical = chunks.find((chunk) => isCritical(chunk.type) && !CRITICAL_CHUNKS.has(chunk.type))
  if (unknownCritical) throw new Error(`This PNG uses an unsupported ${unknownCritical.type} chunk.`)

  const animated = chunks.some((chunk) => chunk.type === 'acTL')
  const removed = new Set<string>()
  const kept = chunks.filter((chunk) => {
    if (isCritical(chunk.type) || chunk.type === 'tRNS') return true
    if (keepAncillary(chunk.type, options, animated)) return true
    removed.add(chunk.type)
    return false
  })

  const unchanged = (): OptimizeResult => ({
    bytes: input,
    originalSize: input.length,
    alreadyOptimal: true,
    animated,
    removedChunks: [],
    before,
    after: before,
    filter: null,
  })

  // The original image data with only the extra chunks removed is always a
  // valid, pixel-identical output, so it is the baseline to beat.
  const stripped = writeChunks(kept)
  let result: OptimizeResult = {
    bytes: stripped,
    originalSize: input.length,
    alreadyOptimal: false,
    animated,
    removedChunks: [...removed],
    before,
    after: before,
    filter: null,
  }

  if (!animated) {
    // Checked before inflating too, so a crafted header can't make the
    // worker decompress a huge stream only to reject it afterwards.
    if (header.width * header.height > MAX_PIXELS) throw new Error('This PNG is too large to optimize.')
    const idat = concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data))
    let inflated: Uint8Array
    try {
      inflated = unzlibSync(idat)
    } catch {
      throw new Error('This PNG has corrupt image data.')
    }
    const image = decodeImage(inflated, {
      header,
      palette: chunks.find((chunk) => chunk.type === 'PLTE')?.data ?? null,
      transparency: chunks.find((chunk) => chunk.type === 'tRNS')?.data ?? null,
    })
    const best = bestCandidate(planEncodings(image))
    const { encoding } = best
    const out: PngChunk[] = [
      {
        type: 'IHDR',
        data: encodeHeader({
          width: encoding.width,
          height: encoding.height,
          colorType: encoding.colorType,
          bitDepth: encoding.bitDepth,
          interlaced: false,
        }),
      },
      ...kept.filter((chunk) => COLOR_PROFILE_CHUNKS.has(chunk.type)),
    ]
    if (encoding.palette) out.push({ type: 'PLTE', data: encoding.palette })
    if (encoding.transparency) out.push({ type: 'tRNS', data: encoding.transparency })
    out.push(...kept.filter((chunk) => KEPT_CHUNKS.has(chunk.type)))
    out.push({ type: 'IDAT', data: best.compressed }, { type: 'IEND', data: new Uint8Array(0) })
    const reencoded = writeChunks(out)
    if (reencoded.length < stripped.length) {
      result = {
        ...result,
        bytes: reencoded,
        after: { colorType: encoding.colorType, bitDepth: encoding.bitDepth, interlaced: false },
        filter: best.strategy.name,
      }
    }
  }

  return result.bytes.length < input.length ? result : unchanged()
}

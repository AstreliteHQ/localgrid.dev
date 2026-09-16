/** Format catalogue and magic-byte sniffing behind the Image Converter
 * widget. Source images are identified from their own bytes rather than
 * from the file extension or the `type` the browser puts on a dropped
 * File: both are routinely wrong (a `.png` that is really a JPEG, an empty
 * `type` for anything dragged out of an archive or an unusual file
 * manager), and the whole point of the widget is that you can drop
 * something and be told what it actually is. */

export type ImageFormatId = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp' | 'avif' | 'heic' | 'tiff' | 'ico' | 'svg' | 'jxl'

export interface ImageFormat {
  id: ImageFormatId
  label: string
  mimeType: string
  extension: string
  /** False for formats that flatten transparency (JPEG, BMP): converting
   * into one of those needs a matte colour painted under the image first,
   * otherwise the alpha areas come out black. */
  supportsAlpha: boolean
  /** True when the encoder takes a 0..1 quality factor. */
  lossy: boolean
}

export const IMAGE_FORMATS: Record<ImageFormatId, ImageFormat> = {
  png: { id: 'png', label: 'PNG', mimeType: 'image/png', extension: 'png', supportsAlpha: true, lossy: false },
  jpeg: { id: 'jpeg', label: 'JPEG', mimeType: 'image/jpeg', extension: 'jpg', supportsAlpha: false, lossy: true },
  webp: { id: 'webp', label: 'WebP', mimeType: 'image/webp', extension: 'webp', supportsAlpha: true, lossy: true },
  avif: { id: 'avif', label: 'AVIF', mimeType: 'image/avif', extension: 'avif', supportsAlpha: true, lossy: true },
  gif: { id: 'gif', label: 'GIF', mimeType: 'image/gif', extension: 'gif', supportsAlpha: true, lossy: false },
  bmp: { id: 'bmp', label: 'BMP', mimeType: 'image/bmp', extension: 'bmp', supportsAlpha: false, lossy: false },
  heic: { id: 'heic', label: 'HEIC', mimeType: 'image/heic', extension: 'heic', supportsAlpha: true, lossy: true },
  tiff: { id: 'tiff', label: 'TIFF', mimeType: 'image/tiff', extension: 'tiff', supportsAlpha: true, lossy: false },
  ico: { id: 'ico', label: 'ICO', mimeType: 'image/x-icon', extension: 'ico', supportsAlpha: true, lossy: false },
  svg: { id: 'svg', label: 'SVG', mimeType: 'image/svg+xml', extension: 'svg', supportsAlpha: true, lossy: false },
  jxl: { id: 'jxl', label: 'JPEG XL', mimeType: 'image/jxl', extension: 'jxl', supportsAlpha: true, lossy: true },
}

/** Every format a `<canvas>` can plausibly be asked to encode. What the
 * browser actually supports is narrower and is probed at runtime by
 * `listEncodableFormats`. */
const CANDIDATE_TARGET_IDS: ImageFormatId[] = ['png', 'jpeg', 'webp', 'avif']

/** PNG, JPEG and WebP are required by the HTML spec or supported
 * everywhere we care about; AVIF encoding is not, hence the probe. */
const FALLBACK_TARGET_IDS: ImageFormatId[] = ['png', 'jpeg', 'webp']

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return ''
  let text = ''
  for (let index = offset; index < offset + length; index += 1) {
    text += String.fromCharCode(bytes[index])
  }
  return text
}

/** ISO base media brands that ride in the same `ftyp` box layout as AVIF.
 * `mif1`/`msf1` are the generic image/image-sequence brands Apple writes
 * into plenty of real `.heic` files, so they belong here rather than in an
 * "unknown" bucket. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

function detectIsoBaseMedia(bytes: Uint8Array): ImageFormat | null {
  if (asciiAt(bytes, 4, 4) !== 'ftyp') return null
  const brand = asciiAt(bytes, 8, 4)
  if (AVIF_BRANDS.has(brand)) return IMAGE_FORMATS.avif
  if (HEIC_BRANDS.has(brand)) return IMAGE_FORMATS.heic
  return null
}

/** SVG is the one format here with no binary signature, so it is sniffed
 * from text instead: skip a BOM plus any leading whitespace, XML
 * declaration, doctype or comment, and look for an `<svg` root tag near
 * the start of the file. */
function detectSvg(bytes: Uint8Array): ImageFormat | null {
  // asciiAt() reads one char per byte, so a UTF-8 BOM shows up as its
  // three raw bytes rather than as U+FEFF.
  const head = asciiAt(bytes, 0, Math.min(bytes.length, 1024))
    .replace(/^\u00ef\u00bb\u00bf/, '')
    .trimStart()
  if (!head.startsWith('<')) return null

  // The prologue (XML declaration, doctype, comments) is consumed one piece
  // at a time so that `<svg` has to be the *root* element. Accepting it
  // anywhere in the window instead would classify an HTML page with an
  // inline icon, or a comment that merely mentions `<svg>`, as an image.
  let rest = head
  for (;;) {
    if (rest.startsWith('<?xml')) {
      const end = rest.indexOf('?>')
      if (end === -1) return null
      rest = rest.slice(end + 2).trimStart()
      continue
    }
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->')
      if (end === -1) return null
      rest = rest.slice(end + 3).trimStart()
      continue
    }
    if (/^<!doctype/i.test(rest)) {
      // A doctype may carry an internal subset in brackets, whose own `>`
      // characters do not end it.
      const subset = rest.indexOf('[')
      const from = subset !== -1 && subset < rest.indexOf('>') ? rest.indexOf(']', subset) : 0
      if (from === -1) return null
      const end = rest.indexOf('>', from)
      if (end === -1) return null
      rest = rest.slice(end + 1).trimStart()
      continue
    }
    break
  }

  // The `/` accepts a self-closing root written without a space,
  // e.g. a minified `<svg/>`.
  return /^<svg[\s/>]/i.test(rest) ? IMAGE_FORMATS.svg : null
}

/** Identifies an image from the first bytes of the file, or returns null
 * when nothing matches (not an image, or a format we don't know). Only the
 * header is ever read, so passing a slice of a large file is fine. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return IMAGE_FORMATS.png
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return IMAGE_FORMATS.jpeg
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') return IMAGE_FORMATS.webp
  if (asciiAt(bytes, 0, 6) === 'GIF87a' || asciiAt(bytes, 0, 6) === 'GIF89a') return IMAGE_FORMATS.gif
  if (asciiAt(bytes, 0, 2) === 'BM') return IMAGE_FORMATS.bmp
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return IMAGE_FORMATS.tiff
  }
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return IMAGE_FORMATS.ico
  // Bare codestream (FF 0A) and the ISO-BMFF container both count as JXL.
  if (startsWith(bytes, [0xff, 0x0a])) return IMAGE_FORMATS.jxl
  if (startsWith(bytes, [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) {
    return IMAGE_FORMATS.jxl
  }
  const isoBaseMedia = detectIsoBaseMedia(bytes)
  if (isoBaseMedia) return isoBaseMedia
  return detectSvg(bytes)
}

let encodableCache: ImageFormat[] | null = null

function canEncode(mimeType: string): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`)
  } catch {
    // jsdom and any browser without a 2D canvas: fall back to the formats
    // the spec guarantees rather than claiming nothing works.
    return FALLBACK_TARGET_IDS.includes(mimeType.replace('image/', '') as ImageFormatId)
  }
}

/** Target formats this browser can actually encode to, probed once. A
 * canvas asked for an unsupported type silently hands back a PNG, so
 * offering AVIF unconditionally would mean handing people a `.avif` file
 * that is really a PNG. */
export function listEncodableFormats(): ImageFormat[] {
  if (encodableCache) return encodableCache
  const supported = CANDIDATE_TARGET_IDS.filter((id) => canEncode(IMAGE_FORMATS[id].mimeType))
  const ids = supported.length > 0 ? supported : FALLBACK_TARGET_IDS
  encodableCache = ids.map((id) => IMAGE_FORMATS[id])
  return encodableCache
}

/** Test seam: drops the memoized probe result. */
export function resetEncodableFormatsCache(): void {
  encodableCache = null
}

const KNOWN_EXTENSIONS = new Set([
  ...Object.values(IMAGE_FORMATS).map((format) => format.extension),
  'jpeg',
  'jpe',
  'tif',
  'htm',
])

/** Names the converted file after the source, swapping a recognized image
 * extension for the target one (`shot.png` -> `shot.webp`) and appending
 * when there is nothing image-like to replace (`archive.tar` ->
 * `archive.tar.webp`). */
export function outputFileName(sourceName: string, format: ImageFormat): string {
  const trimmed = sourceName.trim() || 'image'
  const dot = trimmed.lastIndexOf('.')
  const extension = dot > 0 ? trimmed.slice(dot + 1).toLowerCase() : ''
  const base = dot > 0 && KNOWN_EXTENSIONS.has(extension) ? trimmed.slice(0, dot) : trimmed
  return `${base}.${format.extension}`
}

/** Human-readable file size, used for the source/result comparison. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1000
  let unitIndex = 0
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000
    unitIndex += 1
  }
  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ${units[unitIndex]}`
}

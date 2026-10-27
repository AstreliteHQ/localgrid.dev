import { unzlibSync } from 'fflate'
import { readChunks, writeChunks, type PngChunk } from '@/widgets/png-optimizer/png'

/** Image formats whose metadata this widget can read and rewrite. All three
 * carry EXIF and XMP; only JPEG has a standard home for IPTC (inside a
 * Photoshop APP13 segment). */
export type ContainerFormat = 'jpeg' | 'png' | 'webp'

export const CONTAINER_LABELS: Record<ContainerFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
}

/** The raw metadata payloads of an image, already unwrapped from their
 * container framing. `null` means the block is absent (or should be). */
export interface MetadataBlocks {
  /** A TIFF structure, starting at its `II`/`MM` byte order mark. */
  exif: Uint8Array | null
  xmp: string | null
  /** A Photoshop image resource block (a run of `8BIM` resources), JPEG only. */
  photoshop: Uint8Array | null
}

const EXIF_HEADER = 'Exif\0\0'
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0'
const XMP_EXTENSION_HEADER = 'http://ns.adobe.com/xmp/extension/\0'
const PHOTOSHOP_HEADER = 'Photoshop 3.0\0'
const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp'
/** A JPEG segment length is 16 bits and counts itself. */
const MAX_JPEG_PAYLOAD = 0xffff - 2

const VP8X_EXIF_FLAG = 0x08
const VP8X_XMP_FLAG = 0x04

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function startsWith(bytes: Uint8Array, prefix: string, offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[offset + index] !== prefix.charCodeAt(index)) return false
  }
  return true
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
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

export function detectContainer(bytes: Uint8Array): ContainerFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (startsWith(bytes, '\x89PNG\r\n\x1a\n')) return 'png'
  if (startsWith(bytes, 'RIFF') && startsWith(bytes, 'WEBP', 8)) return 'webp'
  return null
}

// JPEG

interface JpegSegment {
  marker: number
  payload: Uint8Array
}

interface JpegFile {
  segments: JpegSegment[]
  /** Everything from the start-of-scan marker on, copied through untouched. */
  scan: Uint8Array
}

function readJpeg(bytes: Uint8Array): JpegFile {
  const segments: JpegSegment[] = []
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('This JPEG has a malformed segment.')
    // Any number of 0xFF fill bytes may precede a marker.
    while (bytes[offset + 1] === 0xff) offset += 1
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) return { segments, scan: bytes.subarray(offset) }
    if (offset + 4 > bytes.length) break
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    const end = offset + 2 + length
    if (length < 2 || end > bytes.length) break
    segments.push({ marker, payload: bytes.subarray(offset + 4, end) })
    offset = end
  }
  throw new Error('This JPEG is truncated.')
}

function writeJpeg(file: JpegFile): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)]
  for (const segment of file.segments) {
    const length = segment.payload.length + 2
    parts.push(Uint8Array.of(0xff, segment.marker, length >> 8, length & 0xff), segment.payload)
  }
  parts.push(file.scan)
  return concat(parts)
}

type JpegBlock = 'exif' | 'xmp' | 'xmp-extension' | 'photoshop'

function classifyJpegSegment(segment: JpegSegment): JpegBlock | null {
  if (segment.marker === 0xe1 && startsWith(segment.payload, EXIF_HEADER)) return 'exif'
  if (segment.marker === 0xe1 && startsWith(segment.payload, XMP_HEADER)) return 'xmp'
  if (segment.marker === 0xe1 && startsWith(segment.payload, XMP_EXTENSION_HEADER)) return 'xmp-extension'
  if (segment.marker === 0xed && startsWith(segment.payload, PHOTOSHOP_HEADER)) return 'photoshop'
  return null
}

function readJpegBlocks(bytes: Uint8Array): MetadataBlocks {
  const blocks: MetadataBlocks = { exif: null, xmp: null, photoshop: null }
  // Photoshop splits a resource block too large for one segment across
  // several APP13 segments, which readers join back together.
  const photoshop: Uint8Array[] = []
  for (const segment of readJpeg(bytes).segments) {
    const kind = classifyJpegSegment(segment)
    if (kind === 'exif') blocks.exif ??= segment.payload.slice(EXIF_HEADER.length)
    else if (kind === 'xmp') blocks.xmp ??= decoder.decode(segment.payload.subarray(XMP_HEADER.length))
    else if (kind === 'photoshop') photoshop.push(segment.payload.subarray(PHOTOSHOP_HEADER.length))
  }
  if (photoshop.length > 0) blocks.photoshop = concat(photoshop)
  return blocks
}

function jpegPayload(header: string, body: Uint8Array, label: string): Uint8Array {
  const payload = concat([ascii(header), body])
  if (payload.length > MAX_JPEG_PAYLOAD) throw new Error(`The edited ${label} block is too large for a JPEG segment.`)
  return payload
}

/** Rewrites each block in place, so the segment order a decoder expects
 * (JFIF first, then EXIF) is kept. A block can only shrink or vanish here,
 * never appear where there was none, since edits only touch existing fields. */
function writeJpegBlocks(bytes: Uint8Array, blocks: MetadataBlocks): Uint8Array {
  const file = readJpeg(bytes)
  const written = new Set<JpegBlock>()
  const segments: JpegSegment[] = []
  for (const segment of file.segments) {
    const kind = classifyJpegSegment(segment)
    if (!kind) {
      segments.push(segment)
      continue
    }
    if (kind === 'xmp-extension') {
      // Extended XMP is only meaningful next to the main packet that
      // references it, so it goes away with that packet and stays otherwise.
      if (blocks.xmp !== null) segments.push(segment)
      continue
    }
    if (written.has(kind)) continue
    written.add(kind)
    if (kind === 'exif' && blocks.exif) {
      segments.push({ marker: 0xe1, payload: jpegPayload(EXIF_HEADER, blocks.exif, 'EXIF') })
    } else if (kind === 'xmp' && blocks.xmp !== null) {
      segments.push({ marker: 0xe1, payload: jpegPayload(XMP_HEADER, encoder.encode(blocks.xmp), 'XMP') })
    } else if (kind === 'photoshop' && blocks.photoshop) {
      const step = MAX_JPEG_PAYLOAD - PHOTOSHOP_HEADER.length
      for (let at = 0; at < blocks.photoshop.length; at += step) {
        segments.push({
          marker: 0xed,
          payload: jpegPayload(PHOTOSHOP_HEADER, blocks.photoshop.subarray(at, at + step), 'IPTC'),
        })
      }
    }
  }
  return writeJpeg({ segments, scan: file.scan })
}

// PNG

function readPngXmp(data: Uint8Array): string | null {
  if (!startsWith(data, `${PNG_XMP_KEYWORD}\0`)) return null
  let offset = PNG_XMP_KEYWORD.length + 1
  const compressed = data[offset] === 1
  offset += 2
  // Skip the language tag and the translated keyword, both NUL terminated.
  for (let skipped = 0; skipped < 2; skipped += 1) {
    const end = data.indexOf(0, offset)
    if (end < 0) return null
    offset = end + 1
  }
  const text = data.subarray(offset)
  return decoder.decode(compressed ? unzlibSync(text) : text)
}

function pngXmpChunk(xmp: string): PngChunk {
  return { type: 'iTXt', data: concat([ascii(`${PNG_XMP_KEYWORD}\0\0\0\0\0`), encoder.encode(xmp)]) }
}

function readPngBlocks(bytes: Uint8Array): MetadataBlocks {
  const blocks: MetadataBlocks = { exif: null, xmp: null, photoshop: null }
  for (const chunk of readChunks(bytes)) {
    if (chunk.type === 'eXIf') blocks.exif ??= chunk.data.slice()
    else if (chunk.type === 'iTXt') blocks.xmp ??= readPngXmp(chunk.data)
  }
  return blocks
}

function writePngBlocks(bytes: Uint8Array, blocks: MetadataBlocks): Uint8Array {
  const chunks: PngChunk[] = []
  let exifDone = false
  let xmpDone = false
  for (const chunk of readChunks(bytes)) {
    if (chunk.type === 'eXIf') {
      if (!exifDone && blocks.exif) chunks.push({ type: 'eXIf', data: blocks.exif })
      exifDone = true
    } else if (chunk.type === 'iTXt' && startsWith(chunk.data, `${PNG_XMP_KEYWORD}\0`)) {
      if (!xmpDone && blocks.xmp !== null) chunks.push(pngXmpChunk(blocks.xmp))
      xmpDone = true
    } else {
      chunks.push(chunk)
    }
  }
  return writeChunks(chunks)
}

// WebP

interface RiffChunk {
  fourcc: string
  data: Uint8Array
}

function readRiff(bytes: Uint8Array): RiffChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = Math.min(bytes.length, 8 + view.getUint32(4, true))
  const chunks: RiffChunk[] = []
  let offset = 12
  while (offset + 8 <= end) {
    const fourcc = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (offset + 8 + size > end) throw new Error('This WebP is truncated.')
    chunks.push({ fourcc, data: bytes.subarray(offset + 8, offset + 8 + size) })
    offset += 8 + size + (size & 1)
  }
  return chunks
}

function writeRiff(chunks: RiffChunk[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const chunk of chunks) {
    const header = new Uint8Array(8)
    header.set(ascii(chunk.fourcc))
    new DataView(header.buffer).setUint32(4, chunk.data.length, true)
    parts.push(header, chunk.data)
    if (chunk.data.length & 1) parts.push(new Uint8Array(1))
  }
  const body = concat(parts)
  const header = new Uint8Array(12)
  header.set(ascii('RIFF'))
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  header.set(ascii('WEBP'), 8)
  return concat([header, body])
}

function readWebpBlocks(bytes: Uint8Array): MetadataBlocks {
  const blocks: MetadataBlocks = { exif: null, xmp: null, photoshop: null }
  for (const chunk of readRiff(bytes)) {
    if (chunk.fourcc === 'EXIF') {
      // Some writers keep the JPEG-style "Exif\0\0" prefix the spec drops.
      const data = startsWith(chunk.data, EXIF_HEADER) ? chunk.data.subarray(EXIF_HEADER.length) : chunk.data
      blocks.exif ??= data.slice()
    } else if (chunk.fourcc === 'XMP ') {
      blocks.xmp ??= decoder.decode(chunk.data)
    }
  }
  return blocks
}

function writeWebpBlocks(bytes: Uint8Array, blocks: MetadataBlocks): Uint8Array {
  const chunks: RiffChunk[] = []
  for (const chunk of readRiff(bytes)) {
    if (chunk.fourcc === 'EXIF') {
      if (blocks.exif) chunks.push({ fourcc: 'EXIF', data: blocks.exif })
    } else if (chunk.fourcc === 'XMP ') {
      if (blocks.xmp !== null) chunks.push({ fourcc: 'XMP ', data: encoder.encode(blocks.xmp) })
    } else {
      chunks.push(chunk)
    }
  }
  const vp8x = chunks.find((chunk) => chunk.fourcc === 'VP8X')
  if (vp8x) {
    // The extended header advertises which metadata chunks follow, so it
    // has to agree with what is actually left.
    const data = vp8x.data.slice()
    if (!chunks.some((chunk) => chunk.fourcc === 'EXIF')) data[0] &= ~VP8X_EXIF_FLAG
    if (!chunks.some((chunk) => chunk.fourcc === 'XMP ')) data[0] &= ~VP8X_XMP_FLAG
    vp8x.data = data
  }
  return writeRiff(chunks)
}

export function readMetadataBlocks(bytes: Uint8Array, format: ContainerFormat): MetadataBlocks {
  if (format === 'jpeg') return readJpegBlocks(bytes)
  if (format === 'png') return readPngBlocks(bytes)
  return readWebpBlocks(bytes)
}

/** Returns a copy of the image with each metadata block replaced by the one
 * given, or removed where it is `null`. Image data is copied through as is. */
export function writeMetadataBlocks(bytes: Uint8Array, format: ContainerFormat, blocks: MetadataBlocks): Uint8Array {
  if (format === 'jpeg') return writeJpegBlocks(bytes, blocks)
  if (format === 'png') return writePngBlocks(bytes, blocks)
  return writeWebpBlocks(bytes, blocks)
}

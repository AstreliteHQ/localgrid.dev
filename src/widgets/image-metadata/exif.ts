/** Reading and writing the TIFF structure an EXIF block is made of. Values
 * are kept as raw bytes in the block's own byte order, so a tag nobody
 * touched is written back exactly as it was read. */

export type ExifIfd = 'ifd0' | 'exif' | 'gps' | 'interop' | 'ifd1'

export interface ExifEntry {
  ifd: ExifIfd
  tag: number
  type: number
  count: number
  value: Uint8Array
}

export interface ExifData {
  littleEndian: boolean
  entries: ExifEntry[]
  /** The embedded JPEG preview IFD1 points at, if any. */
  thumbnail: Uint8Array | null
}

const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
  13: 4, // IFD
}

const TYPE_LONG = 4

const EXIF_POINTER = 0x8769
const GPS_POINTER = 0x8825
const INTEROP_POINTER = 0xa005
const THUMBNAIL_OFFSET = 0x0201
const THUMBNAIL_LENGTH = 0x0202

const USER_COMMENT = 0x9286
/** Windows Explorer's own title/comment/author/keywords/subject tags, stored
 * as UTF-16LE bytes whatever the block's byte order. */
const XP_TAGS = new Set([0x9c9b, 0x9c9c, 0x9c9d, 0x9c9e, 0x9c9f])

export const MAX_UINT32 = 0xffffffff

function malformed(): Error {
  return new Error('This EXIF block is malformed.')
}

export function parseExif(bytes: Uint8Array): ExifData {
  if (bytes.length < 8) throw malformed()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const order = String.fromCharCode(bytes[0], bytes[1])
  if (order !== 'II' && order !== 'MM') throw malformed()
  const littleEndian = order === 'II'
  if (view.getUint16(2, littleEndian) !== 42) throw malformed()

  const entries: ExifEntry[] = []
  const visited = new Set<number>()
  let thumbnail: Uint8Array | null = null

  const readIfd = (offset: number, ifd: ExifIfd): number => {
    if (visited.has(offset) || offset < 8 || offset + 2 > bytes.length) return 0
    visited.add(offset)
    const count = view.getUint16(offset, littleEndian)
    if (offset + 2 + count * 12 + 4 > bytes.length) throw malformed()
    let thumbOffset = -1
    let thumbLength = -1
    const pointers: [number, ExifIfd][] = []
    for (let index = 0; index < count; index += 1) {
      const at = offset + 2 + index * 12
      const tag = view.getUint16(at, littleEndian)
      const type = view.getUint16(at + 2, littleEndian)
      const valueCount = view.getUint32(at + 4, littleEndian)
      const size = TYPE_SIZES[type]
      if (!size) continue
      const length = size * valueCount
      const valueOffset = length > 4 ? view.getUint32(at + 8, littleEndian) : at + 8
      // An entry pointing outside the block is dropped rather than failing
      // the whole read: cameras do write the odd broken tag.
      if (valueOffset + length > bytes.length) continue
      const value = bytes.slice(valueOffset, valueOffset + length)
      const pointer = valueCount === 1 && length === 4 ? view.getUint32(at + 8, littleEndian) : -1
      if (ifd === 'ifd0' && tag === EXIF_POINTER) pointers.push([pointer, 'exif'])
      else if (ifd === 'ifd0' && tag === GPS_POINTER) pointers.push([pointer, 'gps'])
      else if (ifd === 'exif' && tag === INTEROP_POINTER) pointers.push([pointer, 'interop'])
      else if (ifd === 'ifd1' && tag === THUMBNAIL_OFFSET) thumbOffset = pointer
      else if (ifd === 'ifd1' && tag === THUMBNAIL_LENGTH) thumbLength = pointer
      else entries.push({ ifd, tag, type, count: valueCount, value })
    }
    if (thumbOffset >= 0 && thumbLength > 0 && thumbOffset + thumbLength <= bytes.length) {
      thumbnail = bytes.slice(thumbOffset, thumbOffset + thumbLength)
    }
    for (const [pointer, child] of pointers) if (pointer > 0) readChild(pointer, child)
    return view.getUint32(offset + 2 + count * 12, littleEndian)
  }

  // A broken sub-IFD is dropped like a broken entry, so the rest of the
  // block (GPS in particular) can still be listed and stripped.
  const readChild = (offset: number, ifd: ExifIfd) => {
    try {
      readIfd(offset, ifd)
    } catch {
      // Skipped.
    }
  }

  const next = readIfd(view.getUint32(4, littleEndian), 'ifd0')
  if (next > 0) readChild(next, 'ifd1')
  return { littleEndian, entries, thumbnail }
}

interface PlannedIfd {
  ifd: ExifIfd
  entries: ExifEntry[]
  offset: number
  size: number
}

function dataSize(entry: ExifEntry): number {
  return entry.value.length > 4 ? entry.value.length + (entry.value.length & 1) : 0
}

function longEntry(ifd: ExifIfd, tag: number): ExifEntry {
  return { ifd, tag, type: TYPE_LONG, count: 1, value: new Uint8Array(4) }
}

/** Lays the IFDs out one after another (IFD0, Exif, Interop, GPS, IFD1, then
 * the thumbnail), fixing up every pointer to match the new layout. Note that
 * a MakerNote is copied as is: vendors that store absolute offsets inside it
 * may end up with a MakerNote other tools can no longer decode. */
export function serializeExif(data: ExifData): Uint8Array {
  const { littleEndian } = data
  const groups: Record<ExifIfd, ExifEntry[]> = { ifd0: [], exif: [], gps: [], interop: [], ifd1: [] }
  for (const entry of data.entries) groups[entry.ifd].push(entry)

  const interopPointer = groups.interop.length > 0 ? longEntry('exif', INTEROP_POINTER) : null
  if (interopPointer) groups.exif.push(interopPointer)
  const exifPointer = groups.exif.length > 0 ? longEntry('ifd0', EXIF_POINTER) : null
  if (exifPointer) groups.ifd0.push(exifPointer)
  const gpsPointer = groups.gps.length > 0 ? longEntry('ifd0', GPS_POINTER) : null
  if (gpsPointer) groups.ifd0.push(gpsPointer)
  const thumbOffset = data.thumbnail ? longEntry('ifd1', THUMBNAIL_OFFSET) : null
  const thumbLength = data.thumbnail ? longEntry('ifd1', THUMBNAIL_LENGTH) : null
  if (thumbOffset && thumbLength) groups.ifd1.push(thumbOffset, thumbLength)

  const planned: PlannedIfd[] = []
  let offset = 8
  for (const ifd of ['ifd0', 'exif', 'interop', 'gps', 'ifd1'] as const) {
    if (groups[ifd].length === 0 && ifd !== 'ifd0') continue
    const entries = groups[ifd].sort((a, b) => a.tag - b.tag)
    const size = 2 + entries.length * 12 + 4 + entries.reduce((sum, entry) => sum + dataSize(entry), 0)
    planned.push({ ifd, entries, offset, size })
    offset += size
  }
  const thumbnailAt = offset
  const total = offset + (data.thumbnail?.length ?? 0)

  const offsetOf = (ifd: ExifIfd) => planned.find((item) => item.ifd === ifd)?.offset ?? 0
  const setLong = (entry: ExifEntry | null, value: number) => {
    if (entry) new DataView(entry.value.buffer).setUint32(0, value, littleEndian)
  }
  setLong(exifPointer, offsetOf('exif'))
  setLong(gpsPointer, offsetOf('gps'))
  setLong(interopPointer, offsetOf('interop'))
  setLong(thumbOffset, thumbnailAt)
  setLong(thumbLength, data.thumbnail?.length ?? 0)

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out[0] = out[1] = littleEndian ? 0x49 : 0x4d
  view.setUint16(2, 42, littleEndian)
  view.setUint32(4, 8, littleEndian)

  for (const item of planned) {
    view.setUint16(item.offset, item.entries.length, littleEndian)
    let dataAt = item.offset + 2 + item.entries.length * 12 + 4
    item.entries.forEach((entry, index) => {
      const at = item.offset + 2 + index * 12
      view.setUint16(at, entry.tag, littleEndian)
      view.setUint16(at + 2, entry.type, littleEndian)
      view.setUint32(at + 4, entry.count, littleEndian)
      if (entry.value.length > 4) {
        view.setUint32(at + 8, dataAt, littleEndian)
        out.set(entry.value, dataAt)
        dataAt += dataSize(entry)
      } else {
        out.set(entry.value, at + 8)
      }
    })
    const next = item.ifd === 'ifd0' ? offsetOf('ifd1') : 0
    view.setUint32(item.offset + 2 + item.entries.length * 12, next, littleEndian)
  }
  if (data.thumbnail) out.set(data.thumbnail, thumbnailAt)
  return out
}

// Value codec

function valueView(entry: ExifEntry): DataView {
  return new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength)
}

/** The numbers an entry holds; rationals come back as [numerator, denominator] pairs flattened. */
export function exifNumbers(entry: ExifEntry, littleEndian: boolean): number[] {
  const view = valueView(entry)
  const size = TYPE_SIZES[entry.type]
  const values: number[] = []
  const rational = entry.type === 5 || entry.type === 10
  const count = rational ? entry.count * 2 : entry.count
  const step = rational ? 4 : size
  for (let index = 0; index < count; index += 1) {
    const at = index * step
    switch (entry.type) {
      case 1:
      case 7:
        values.push(view.getUint8(at))
        break
      case 6:
        values.push(view.getInt8(at))
        break
      case 3:
        values.push(view.getUint16(at, littleEndian))
        break
      case 8:
        values.push(view.getInt16(at, littleEndian))
        break
      case 4:
      case 5:
        values.push(view.getUint32(at, littleEndian))
        break
      case 9:
      case 10:
        values.push(view.getInt32(at, littleEndian))
        break
      case 11:
        values.push(view.getFloat32(at, littleEndian))
        break
      case 12:
        values.push(view.getFloat64(at, littleEndian))
        break
    }
  }
  return values
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(8)))
}

export function formatRational(numerator: number, denominator: number): string {
  if (denominator === 0) return numerator === 0 ? '0' : `${numerator}/0`
  if (numerator % denominator === 0) return String(numerator / denominator)
  if (numerator === 1) return `1/${denominator}`
  return formatNumber(numerator / denominator)
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) [x, y] = [y, x % y]
  return x || 1
}

/** Accepts `a/b` or a plain decimal, which is turned into the smallest
 * power-of-ten fraction that represents it (up to six decimals). */
export function parseRational(text: string, signed: boolean): [number, number] {
  const trimmed = text.trim()
  const fraction = /^(-?\d+)\s*\/\s*(\d+)$/.exec(trimmed)
  let numerator: number
  let denominator: number
  if (fraction) {
    numerator = Number(fraction[1])
    denominator = Number(fraction[2])
  } else {
    const value = Number(trimmed)
    if (trimmed === '' || !Number.isFinite(value)) throw new Error(`"${trimmed}" is not a number or a fraction.`)
    let scale = 1
    while (scale < 1e6 && !Number.isInteger(Number((value * scale).toFixed(6)))) scale *= 10
    numerator = Math.round(value * scale)
    denominator = scale
    const divisor = gcd(numerator, denominator)
    numerator /= divisor
    denominator /= divisor
  }
  const limit = signed ? 0x7fffffff : MAX_UINT32
  if (!signed && numerator < 0) throw new Error('This field cannot be negative.')
  if (Math.abs(numerator) > limit || denominator > limit) throw new Error('That number is too large.')
  return [numerator, denominator]
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(bytes).replace(/\0+$/, '')
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array((text.length + 1) * 2)
  const view = new DataView(out.buffer)
  for (let index = 0; index < text.length; index += 1) view.setUint16(index * 2, text.charCodeAt(index), littleEndian)
  return out
}

function isPrintableAscii(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes.every((byte) => byte >= 0x20 && byte < 0x7f)
}

export function isExifTextEntry(entry: ExifEntry): boolean {
  return entry.type === 2 || XP_TAGS.has(entry.tag) || (entry.tag === USER_COMMENT && entry.type === 7)
}

export function formatExifValue(entry: ExifEntry, littleEndian: boolean): string {
  if (entry.type === 2) return new TextDecoder().decode(entry.value).replace(/\0+$/, '').trim()
  if (XP_TAGS.has(entry.tag) && entry.type === 1) return decodeUtf16(entry.value, true)
  if (entry.type === 7) {
    if (entry.tag === USER_COMMENT && entry.value.length >= 8) {
      const charset = String.fromCharCode(...entry.value.subarray(0, 8)).replace(/\0+$/, '')
      const body = entry.value.subarray(8)
      if (charset === 'UNICODE') return decodeUtf16(body, littleEndian).trim()
      return new TextDecoder().decode(body).replace(/\0+$/, '').trim()
    }
    if (entry.value.length <= 16 && isPrintableAscii(entry.value)) return String.fromCharCode(...entry.value)
    return `${entry.value.length} bytes of binary data`
  }
  const numbers = exifNumbers(entry, littleEndian)
  if (entry.type === 5 || entry.type === 10) {
    const parts: string[] = []
    for (let index = 0; index < numbers.length; index += 2)
      parts.push(formatRational(numbers[index], numbers[index + 1]))
    return parts.join(', ')
  }
  if (numbers.length > 32) return `${numbers.length} values`
  return numbers.map(formatNumber).join(', ')
}

export function isExifEditable(entry: ExifEntry): boolean {
  if (isExifTextEntry(entry)) return true
  if (entry.type === 7 || entry.type === 13) return false
  // Long arrays (curves, tables) are not something to edit by hand.
  return entry.count <= 32
}

const INTEGER_RANGES: Record<number, [number, number]> = {
  1: [0, 0xff],
  3: [0, 0xffff],
  4: [0, MAX_UINT32],
  6: [-0x80, 0x7f],
  8: [-0x8000, 0x7fff],
  9: [-0x80000000, 0x7fffffff],
}

/** Builds the entry a user's text turns into. Throws an Error with a
 * readable message when the text does not fit the tag's type. Numeric tags
 * keep their value count, since readers expect e.g. exactly three GPS
 * rationals. */
export function encodeExifValue(entry: ExifEntry, text: string, littleEndian: boolean): ExifEntry {
  if (entry.type === 2) {
    const value = new TextEncoder().encode(`${text}\0`)
    return { ...entry, count: value.length, value }
  }
  if (XP_TAGS.has(entry.tag) && entry.type === 1) {
    const value = encodeUtf16(text, true)
    return { ...entry, count: value.length, value }
  }
  if (entry.tag === USER_COMMENT && entry.type === 7) {
    const unicode = !/^[\x20-\x7e]*$/.test(text)
    const header = new TextEncoder().encode(unicode ? 'UNICODE\0' : 'ASCII\0\0\0')
    const body = unicode ? encodeUtf16(text, littleEndian).subarray(0, text.length * 2) : new TextEncoder().encode(text)
    const value = new Uint8Array(header.length + body.length)
    value.set(header)
    value.set(body, header.length)
    return { ...entry, count: value.length, value }
  }
  if (!isExifEditable(entry)) throw new Error('This field cannot be edited.')

  const parts = text.split(/[,\s]+/).filter(Boolean)
  if (parts.length !== entry.count) {
    throw new Error(entry.count === 1 ? 'Expected a single value.' : `Expected ${entry.count} values.`)
  }
  const size = TYPE_SIZES[entry.type]
  const value = new Uint8Array(size * entry.count)
  const view = new DataView(value.buffer)
  parts.forEach((part, index) => {
    const at = index * size
    if (entry.type === 5 || entry.type === 10) {
      const [numerator, denominator] = parseRational(part, entry.type === 10)
      if (entry.type === 5) {
        view.setUint32(at, numerator, littleEndian)
        view.setUint32(at + 4, denominator, littleEndian)
      } else {
        view.setInt32(at, numerator, littleEndian)
        view.setInt32(at + 4, denominator, littleEndian)
      }
      return
    }
    const number = Number(part)
    if (!Number.isFinite(number)) throw new Error(`"${part}" is not a number.`)
    if (entry.type === 11) return view.setFloat32(at, number, littleEndian)
    if (entry.type === 12) return view.setFloat64(at, number, littleEndian)
    const [min, max] = INTEGER_RANGES[entry.type]
    if (!Number.isInteger(number)) throw new Error(`"${part}" is not a whole number.`)
    if (number < min || number > max) throw new Error(`${part} is out of range (${min} to ${max}).`)
    if (entry.type === 1) view.setUint8(at, number)
    else if (entry.type === 6) view.setInt8(at, number)
    else if (entry.type === 3) view.setUint16(at, number, littleEndian)
    else if (entry.type === 8) view.setInt16(at, number, littleEndian)
    else if (entry.type === 4) view.setUint32(at, number, littleEndian)
    else view.setInt32(at, number, littleEndian)
  })
  return { ...entry, value }
}

/** Decimal degrees from the GPS IFD, or null when it has no usable fix. */
export function exifGpsPosition(data: ExifData): { latitude: number; longitude: number } | null {
  const find = (tag: number) => data.entries.find((entry) => entry.ifd === 'gps' && entry.tag === tag)
  const degrees = (tag: number, refTag: number, negative: string): number | null => {
    const entry = find(tag)
    if (!entry || entry.type !== 5 || entry.count !== 3) return null
    const numbers = exifNumbers(entry, data.littleEndian)
    const [d, m, s] = [0, 2, 4].map((index) => (numbers[index + 1] ? numbers[index] / numbers[index + 1] : 0))
    const ref = find(refTag)
    const sign = ref && formatExifValue(ref, data.littleEndian).toUpperCase() === negative ? -1 : 1
    return sign * (d + m / 60 + s / 3600)
  }
  const latitude = degrees(0x02, 0x01, 'S')
  const longitude = degrees(0x04, 0x03, 'W')
  if (latitude === null || longitude === null) return null
  return { latitude, longitude }
}

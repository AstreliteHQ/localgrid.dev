import { describe, expect, it } from 'vitest'
import {
  encodeExifValue,
  exifGpsPosition,
  formatExifValue,
  formatRational,
  isExifEditable,
  parseExif,
  parseRational,
  serializeExif,
  type ExifEntry,
} from './exif'
import { rationalEntry, sampleExif, shortEntry, textEntry, THUMBNAIL } from './testImages'

function find(entries: ExifEntry[], ifd: ExifEntry['ifd'], tag: number): ExifEntry {
  const entry = entries.find((item) => item.ifd === ifd && item.tag === tag)
  if (!entry) throw new Error(`missing ${ifd} ${tag}`)
  return entry
}

describe('parseExif / serializeExif', () => {
  it.each([true, false])('round trips every IFD and the thumbnail (little endian: %s)', (littleEndian) => {
    const data = parseExif(sampleExif(littleEndian))
    expect(data.littleEndian).toBe(littleEndian)
    expect(new Set(data.entries.map((entry) => entry.ifd))).toEqual(new Set(['ifd0', 'exif', 'gps', 'interop', 'ifd1']))
    expect(formatExifValue(find(data.entries, 'ifd0', 0x0110), littleEndian)).toBe('Canon EOS R6')
    expect(formatExifValue(find(data.entries, 'interop', 0x0001), littleEndian)).toBe('R98')
    expect(data.thumbnail).toEqual(THUMBNAIL)

    const again = parseExif(serializeExif(data))
    expect(again.entries).toEqual(data.entries)
    expect(again.thumbnail).toEqual(THUMBNAIL)
  })

  it('reads a hand-built big-endian block', () => {
    // MM, 42, IFD0 at 8: one ASCII entry "Make" = "Abc" stored inline.
    // prettier-ignore
    const bytes = Uint8Array.of(
      0x4d, 0x4d, 0, 42, 0, 0, 0, 8,
      0, 1,
      0x01, 0x0f, 0, 2, 0, 0, 0, 4, 0x41, 0x62, 0x63, 0,
      0, 0, 0, 0,
    )
    const data = parseExif(bytes)
    expect(data.entries).toHaveLength(1)
    expect(formatExifValue(data.entries[0], false)).toBe('Abc')
  })

  it('drops sub-IFDs that end up empty', () => {
    const data = parseExif(sampleExif())
    const withoutGps = parseExif(
      serializeExif({ ...data, entries: data.entries.filter((entry) => entry.ifd !== 'gps') }),
    )
    expect(withoutGps.entries.some((entry) => entry.ifd === 'gps')).toBe(false)
    expect(withoutGps.entries.filter((entry) => entry.ifd !== 'gps')).toEqual(
      data.entries.filter((entry) => entry.ifd !== 'gps'),
    )
  })

  it('skips a broken sub-IFD and keeps the rest of the block', () => {
    const bytes = sampleExif()
    const data = parseExif(bytes)
    const view = new DataView(bytes.buffer)
    // Point the GPS IFD pointer in IFD0 at the last two bytes, claiming
    // far more entries than fit.
    const count = view.getUint16(8, true)
    for (let index = 0; index < count; index += 1) {
      const at = 10 + index * 12
      if (view.getUint16(at, true) === 0x8825) view.setUint32(at + 8, bytes.length - 2, true)
    }
    view.setUint16(bytes.length - 2, 0xffff, true)
    const broken = parseExif(bytes)
    expect(broken.entries.some((entry) => entry.ifd === 'gps')).toBe(false)
    expect(broken.entries.filter((entry) => entry.ifd === 'ifd0')).toEqual(
      data.entries.filter((entry) => entry.ifd === 'ifd0'),
    )
  })

  it('rejects data that is not TIFF', () => {
    expect(() => parseExif(new Uint8Array(20))).toThrow(/malformed/)
  })
})

describe('value formatting', () => {
  it('prints rationals the way photographers read them', () => {
    expect(formatRational(1, 250)).toBe('1/250')
    expect(formatRational(28, 10)).toBe('2.8')
    expect(formatRational(400, 1)).toBe('400')
    expect(
      formatExifValue(
        rationalEntry('gps', 2, [
          [48, 1],
          [51, 1],
          [2964, 100],
        ]),
        true,
      ),
    ).toBe('48, 51, 29.64')
  })

  it('parses fractions and decimals back into rationals', () => {
    expect(parseRational('1/250', false)).toEqual([1, 250])
    expect(parseRational('2.8', false)).toEqual([14, 5])
    expect(parseRational('-0.5', true)).toEqual([-1, 2])
    expect(() => parseRational('-1', false)).toThrow(/negative/)
    expect(() => parseRational('abc', false)).toThrow(/not a number/)
  })

  it('decodes a UTF-16 UserComment and Windows XP tags', () => {
    const comment: ExifEntry = {
      ifd: 'exif',
      tag: 0x9286,
      type: 7,
      count: 12,
      value: Uint8Array.of(...[...'UNICODE\0'].map((char) => char.charCodeAt(0)), 0x48, 0, 0x69, 0),
    }
    expect(formatExifValue(comment, true)).toBe('Hi')
    const title = encodeExifValue(
      { ifd: 'ifd0', tag: 0x9c9b, type: 1, count: 0, value: new Uint8Array(0) },
      'Été',
      true,
    )
    expect(formatExifValue(title, true)).toBe('Été')
  })
})

describe('encodeExifValue', () => {
  it('rewrites text, growing the count with it', () => {
    const entry = encodeExifValue(textEntry('ifd0', 0x013b, 'Jane'), 'Someone Else', true)
    expect(entry.count).toBe(13)
    expect(formatExifValue(entry, true)).toBe('Someone Else')
  })

  it('keeps numeric tags at their original value count', () => {
    const latitude = rationalEntry(
      'gps',
      2,
      [
        [48, 1],
        [51, 1],
        [2964, 100],
      ],
      false,
    )
    expect(formatExifValue(encodeExifValue(latitude, '10, 20, 30.5', false), false)).toBe('10, 20, 30.5')
    expect(() => encodeExifValue(latitude, '10', false)).toThrow('Expected 3 values.')
  })

  it('range checks integers', () => {
    const orientation = shortEntry('ifd0', 0x0112, [1])
    expect(formatExifValue(encodeExifValue(orientation, '6', true), true)).toBe('6')
    expect(() => encodeExifValue(orientation, '70000', true)).toThrow(/out of range/)
    expect(() => encodeExifValue(orientation, '1.5', true)).toThrow(/whole number/)
  })

  it('only allows editing values that make sense as text', () => {
    const makerNote: ExifEntry = { ifd: 'exif', tag: 0x927c, type: 7, count: 100, value: new Uint8Array(100) }
    expect(isExifEditable(makerNote)).toBe(false)
    expect(formatExifValue(makerNote, true)).toBe('100 bytes of binary data')
    expect(() => encodeExifValue(makerNote, 'x', true)).toThrow(/cannot be edited/)
  })
})

describe('exifGpsPosition', () => {
  it('converts degrees, minutes and seconds to signed decimal degrees', () => {
    const position = exifGpsPosition(parseExif(sampleExif()))
    expect(position?.latitude).toBeCloseTo(48.8582, 4)
    expect(position?.longitude).toBeCloseTo(2.2945, 4)
  })

  it('applies the south and west references', () => {
    const data = parseExif(sampleExif())
    data.entries = data.entries.map((entry) =>
      entry.ifd === 'gps' && entry.tag === 1
        ? textEntry('gps', 1, 'S')
        : entry.ifd === 'gps' && entry.tag === 3
          ? textEntry('gps', 3, 'W')
          : entry,
    )
    const position = exifGpsPosition(data)
    expect(position?.latitude).toBeLessThan(0)
    expect(position?.longitude).toBeLessThan(0)
  })
})

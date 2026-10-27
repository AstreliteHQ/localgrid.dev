import { describe, expect, it } from 'vitest'
import { readMetadataBlocks } from './containers'
import { applyMetadataEdits, NO_EDITS, readImageMetadata, type ImageMetadata, type MetadataField } from './metadata'
import { buildJpeg, buildPng, buildWebp, SAMPLE_XMP, sampleExif, samplePhotoshop } from './testImages'

function field(metadata: ImageMetadata, name: string): MetadataField {
  const found = metadata.fields.find((item) => item.name === name)
  if (!found) throw new Error(`no field ${name}`)
  return found
}

const fullJpeg = () => buildJpeg({ exif: sampleExif(), xmp: SAMPLE_XMP, photoshop: samplePhotoshop() })

describe('readImageMetadata', () => {
  it('lists EXIF, IPTC and XMP fields of a JPEG', () => {
    const metadata = readImageMetadata(fullJpeg())
    expect(metadata.format).toBe('jpeg')
    expect(field(metadata, 'Model')).toMatchObject({ section: 'exif', group: 'Image', value: 'Canon EOS R6' })
    expect(field(metadata, 'Orientation')).toMatchObject({ value: '6', hint: 'Rotate 90 CW', editable: true })
    expect(field(metadata, 'ExposureTime').value).toBe('1/250')
    expect(field(metadata, 'ThumbnailImage')).toMatchObject({ group: 'Thumbnail', editable: false })
    expect(field(metadata, 'Caption-Abstract')).toMatchObject({ section: 'iptc', value: 'Sunset over the Seine' })
    expect(field(metadata, 'ResolutionInfo')).toMatchObject({ group: 'Photoshop', editable: false })
    expect(metadata.fields.some((item) => item.name === 'IPTCDigest')).toBe(false)
    expect(field(metadata, 'dc:subject')).toMatchObject({ section: 'xmp', group: 'dc', value: 'paris; travel' })
    expect(metadata.gps?.latitude).toBeCloseTo(48.858, 3)
    expect(metadata.errors).toEqual([])
  })

  it('flags every location field', () => {
    const gps = readImageMetadata(fullJpeg())
      .fields.filter((item) => item.gps)
      .map((item) => item.name)
    expect(gps).toEqual(['GPSLatitudeRef', 'GPSLatitude', 'GPSLongitudeRef', 'GPSLongitude', 'exif:GPSLatitude'])
  })

  it('validates EXIF edits against the tag type', () => {
    const metadata = readImageMetadata(fullJpeg())
    expect(field(metadata, 'ISO').validate?.('800')).toBeNull()
    expect(field(metadata, 'ISO').validate?.('lots')).toBe('"lots" is not a number.')
  })

  it('reports a broken block without hiding the others', () => {
    const metadata = readImageMetadata(buildPng({ exif: new Uint8Array(12), xmp: SAMPLE_XMP }))
    expect(metadata.errors).toEqual(['EXIF: This EXIF block is malformed.'])
    expect(metadata.fields.every((item) => item.section === 'xmp')).toBe(true)
  })

  it('rejects other formats', () => {
    expect(() => readImageMetadata(Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toThrow(/JPEG, PNG and WebP/)
  })
})

describe('applyMetadataEdits', () => {
  it('returns the original bytes when nothing changed', () => {
    const bytes = fullJpeg()
    expect(applyMetadataEdits(bytes, NO_EDITS)).toBe(bytes)
  })

  it('edits and removes fields in every section', () => {
    const bytes = fullJpeg()
    const before = readImageMetadata(bytes)
    const out = applyMetadataEdits(bytes, {
      values: {
        [field(before, 'Artist').id]: 'Anonymous',
        [field(before, 'City').id]: 'Lyon',
        [field(before, 'dc:title').id]: 'Fourvière',
      },
      removed: [field(before, 'Make').id, field(before, 'Caption-Abstract').id, field(before, 'xmp:Rating').id],
    })
    const after = readImageMetadata(out)
    expect(field(after, 'Artist').value).toBe('Anonymous')
    expect(field(after, 'City').value).toBe('Lyon')
    expect(field(after, 'dc:title').value).toBe('Fourvière')
    const names = after.fields.map((item) => item.name)
    expect(names).not.toContain('Make')
    expect(names).not.toContain('Caption-Abstract')
    expect(names).not.toContain('xmp:Rating')
    expect(names).toContain('Model')
  })

  it('strips GPS everywhere it appears', () => {
    const bytes = fullJpeg()
    const before = readImageMetadata(bytes)
    const after = readImageMetadata(
      applyMetadataEdits(bytes, {
        values: {},
        removed: before.fields.filter((item) => item.gps).map((item) => item.id),
      }),
    )
    expect(after.gps).toBeNull()
    expect(after.fields.some((item) => item.gps)).toBe(false)
    expect(after.fields.length).toBe(before.fields.length - 5)
  })

  it('drops whole blocks once every field in them is removed', () => {
    const bytes = fullJpeg()
    const all = readImageMetadata(bytes).fields.map((item) => item.id)
    const out = applyMetadataEdits(bytes, { values: {}, removed: all })
    expect(readMetadataBlocks(out, 'jpeg')).toEqual({ exif: null, xmp: null, photoshop: null })
    expect(out).toEqual(buildJpeg())
  })

  it('removing the thumbnail drops IFD1 as well', () => {
    const bytes = fullJpeg()
    const before = readImageMetadata(bytes)
    const after = readImageMetadata(applyMetadataEdits(bytes, { values: {}, removed: ['exif:thumbnail'] }))
    expect(after.fields.some((item) => item.group === 'Thumbnail')).toBe(false)
    expect(after.fields.filter((item) => item.section === 'exif').length).toBe(
      before.fields.filter((item) => item.section === 'exif' && item.group !== 'Thumbnail').length,
    )
  })

  it('switches IPTC to UTF-8 when a Latin-1 record gets text it cannot hold', () => {
    // The sample declares UTF-8; rebuild one that does not.
    // prettier-ignore
    const irb = Uint8Array.of(
      ...[...'8BIM'].map((char) => char.charCodeAt(0)), 0x04, 0x04, 0, 0, 0, 0, 0, 8,
      0x1c, 2, 90, 0, 3, 0x4d, 0xfc, 0x6e,
    )
    const plain = buildJpeg({ photoshop: irb })
    const before = readImageMetadata(plain)
    expect(field(before, 'City').value).toBe('Mün')
    const after = readImageMetadata(
      applyMetadataEdits(plain, { values: { [field(before, 'City').id]: '東京' }, removed: [] }),
    )
    expect(field(after, 'City').value).toBe('東京')
    expect(field(after, 'CodedCharacterSet').value).toBe('UTF-8')
  })

  it.each([
    ['png', buildPng],
    ['webp', buildWebp],
  ] as const)('edits a %s', (_format, build) => {
    const bytes = build({ exif: sampleExif(), xmp: SAMPLE_XMP })
    const before = readImageMetadata(bytes)
    const after = readImageMetadata(
      applyMetadataEdits(bytes, {
        values: { [field(before, 'Model').id]: 'Phone' },
        removed: [field(before, 'dc:title').id],
      }),
    )
    expect(field(after, 'Model').value).toBe('Phone')
    expect(after.fields.some((item) => item.name === 'dc:title')).toBe(false)
  })

  it('throws on an invalid EXIF edit rather than writing garbage', () => {
    const bytes = fullJpeg()
    const iso = field(readImageMetadata(bytes), 'ISO')
    expect(() => applyMetadataEdits(bytes, { values: { [iso.id]: 'x' }, removed: [] })).toThrow(/not a number/)
  })
})

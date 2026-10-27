import { describe, expect, it } from 'vitest'
import { readChunks } from '@/widgets/png-optimizer/png'
import { detectContainer, readMetadataBlocks, writeMetadataBlocks, type ContainerFormat } from './containers'
import { buildJpeg, buildPng, buildWebp, SAMPLE_XMP, sampleExif, samplePhotoshop } from './testImages'

const builders: Record<ContainerFormat, typeof buildJpeg> = { jpeg: buildJpeg, png: buildPng, webp: buildWebp }

describe('detectContainer', () => {
  it('recognizes each format from its signature', () => {
    expect(detectContainer(buildJpeg())).toBe('jpeg')
    expect(detectContainer(buildPng())).toBe('png')
    expect(detectContainer(buildWebp())).toBe('webp')
    expect(detectContainer(Uint8Array.of(0x47, 0x49, 0x46, 0x38))).toBeNull()
  })
})

describe.each(['jpeg', 'png', 'webp'] as const)('%s blocks', (format) => {
  const build = builders[format]
  const exif = sampleExif()

  it('reads EXIF and XMP', () => {
    const blocks = readMetadataBlocks(build({ exif, xmp: SAMPLE_XMP }), format)
    expect(blocks.exif).toEqual(exif)
    expect(blocks.xmp).toBe(SAMPLE_XMP)
  })

  it('writes the same bytes back when nothing changes', () => {
    const bytes = build({ exif, xmp: SAMPLE_XMP })
    expect(writeMetadataBlocks(bytes, format, readMetadataBlocks(bytes, format))).toEqual(bytes)
  })

  it('strips every block, leaving an image with no metadata', () => {
    const stripped = writeMetadataBlocks(build({ exif, xmp: SAMPLE_XMP }), format, {
      exif: null,
      xmp: null,
      photoshop: null,
    })
    expect(readMetadataBlocks(stripped, format)).toEqual({ exif: null, xmp: null, photoshop: null })
    expect(stripped).toEqual(build())
  })

  it('replaces a block with a new one', () => {
    const bytes = build({ exif, xmp: SAMPLE_XMP })
    const next = writeMetadataBlocks(bytes, format, { exif, xmp: '<x/>', photoshop: null })
    expect(readMetadataBlocks(next, format)).toMatchObject({ exif, xmp: '<x/>' })
  })
})

describe('jpeg specifics', () => {
  it('reads and strips the Photoshop IPTC segment', () => {
    const photoshop = samplePhotoshop()
    const bytes = buildJpeg({ photoshop })
    expect(readMetadataBlocks(bytes, 'jpeg').photoshop).toEqual(photoshop)
    expect(writeMetadataBlocks(bytes, 'jpeg', { exif: null, xmp: null, photoshop: null })).toEqual(buildJpeg())
  })

  it('refuses a block too large for one segment', () => {
    const bytes = buildJpeg({ exif: sampleExif() })
    expect(() =>
      writeMetadataBlocks(bytes, 'jpeg', { exif: new Uint8Array(70000), xmp: null, photoshop: null }),
    ).toThrow(/too large/)
  })
})

describe('png specifics', () => {
  it('keeps unrelated text chunks', () => {
    const stripped = writeMetadataBlocks(buildPng({ exif: sampleExif() }), 'png', {
      exif: null,
      xmp: null,
      photoshop: null,
    })
    expect(readChunks(stripped).map((chunk) => chunk.type)).toEqual(['IHDR', 'tEXt', 'IDAT', 'IEND'])
  })
})

describe('webp specifics', () => {
  it('clears the VP8X flags of removed chunks', () => {
    const bytes = buildWebp({ exif: sampleExif(), xmp: SAMPLE_XMP })
    expect(bytes[20] & 0x0c).toBe(0x0c)
    const noXmp = writeMetadataBlocks(bytes, 'webp', { exif: sampleExif(), xmp: null, photoshop: null })
    expect(noXmp[20] & 0x0c).toBe(0x08)
    expect(new DataView(noXmp.buffer).getUint32(4, true)).toBe(noXmp.length - 8)
  })
})

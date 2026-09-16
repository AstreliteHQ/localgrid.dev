import { describe, expect, it } from 'vitest'
import { detectImageFormat, formatFileSize, IMAGE_FORMATS, outputFileName } from './imageFormats'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

function ascii(text: string, padTo = 0): Uint8Array {
  const out = new Uint8Array(Math.max(text.length, padTo))
  for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index)
  return out
}

function isoBaseMedia(brand: string): Uint8Array {
  const header = new Uint8Array(16)
  header.set(ascii('ftyp'), 4)
  header.set(ascii(brand), 8)
  return header
}

describe('detectImageFormat', () => {
  it('recognizes a PNG signature', () => {
    expect(detectImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(IMAGE_FORMATS.png)
  })

  it('recognizes a JPEG signature', () => {
    expect(detectImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe(IMAGE_FORMATS.jpeg)
  })

  it('recognizes WebP by its RIFF container and WEBP fourcc', () => {
    const webp = ascii('RIFF', 12)
    webp.set(ascii('WEBP'), 8)
    expect(detectImageFormat(webp)).toBe(IMAGE_FORMATS.webp)
  })

  it('does not mistake a non-WebP RIFF file (e.g. a WAV) for an image', () => {
    const wav = ascii('RIFF', 12)
    wav.set(ascii('WAVE'), 8)
    expect(detectImageFormat(wav)).toBeNull()
  })

  it('recognizes both GIF versions', () => {
    expect(detectImageFormat(ascii('GIF87a'))).toBe(IMAGE_FORMATS.gif)
    expect(detectImageFormat(ascii('GIF89a'))).toBe(IMAGE_FORMATS.gif)
  })

  it('recognizes BMP, ICO and both TIFF byte orders', () => {
    expect(detectImageFormat(ascii('BM'))).toBe(IMAGE_FORMATS.bmp)
    expect(detectImageFormat(bytes(0x00, 0x00, 0x01, 0x00, 0x01, 0x00))).toBe(IMAGE_FORMATS.ico)
    expect(detectImageFormat(bytes(0x49, 0x49, 0x2a, 0x00))).toBe(IMAGE_FORMATS.tiff)
    expect(detectImageFormat(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe(IMAGE_FORMATS.tiff)
  })

  it('separates AVIF from HEIC by the ftyp brand', () => {
    expect(detectImageFormat(isoBaseMedia('avif'))).toBe(IMAGE_FORMATS.avif)
    expect(detectImageFormat(isoBaseMedia('avis'))).toBe(IMAGE_FORMATS.avif)
    expect(detectImageFormat(isoBaseMedia('heic'))).toBe(IMAGE_FORMATS.heic)
    expect(detectImageFormat(isoBaseMedia('mif1'))).toBe(IMAGE_FORMATS.heic)
  })

  it('ignores an ISO base media file whose brand is not an image (e.g. MP4)', () => {
    expect(detectImageFormat(isoBaseMedia('isom'))).toBeNull()
  })

  it('recognizes JPEG XL in both its codestream and container forms', () => {
    expect(detectImageFormat(bytes(0xff, 0x0a, 0x00))).toBe(IMAGE_FORMATS.jxl)
    expect(detectImageFormat(bytes(0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a))).toBe(
      IMAGE_FORMATS.jxl,
    )
  })

  it('recognizes SVG as a bare root tag, behind an XML declaration, and after a BOM', () => {
    expect(detectImageFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(IMAGE_FORMATS.svg)
    expect(detectImageFormat(ascii('<?xml version="1.0"?>\n<svg viewBox="0 0 4 4"></svg>'))).toBe(IMAGE_FORMATS.svg)
    expect(detectImageFormat(ascii('ï»¿  <svg></svg>'))).toBe(IMAGE_FORMATS.svg)
  })

  it('does not treat other XML or HTML as SVG', () => {
    expect(detectImageFormat(ascii('<?xml version="1.0"?><rss></rss>'))).toBeNull()
    expect(detectImageFormat(ascii('<!doctype html><html></html>'))).toBeNull()
  })

  it('requires <svg> to be the root element, not merely present', () => {
    // An HTML page with an inline icon: `<svg` appears early, but the
    // document is not an image.
    expect(detectImageFormat(ascii('<!doctype html><html><body><svg viewBox="0 0 8 8"/></body></html>'))).toBeNull()
    // A comment that only mentions the tag.
    expect(detectImageFormat(ascii('<!-- not an <svg> file --><html></html>'))).toBeNull()
    // An XML document of another kind that embeds one.
    expect(detectImageFormat(ascii('<?xml version="1.0"?><doc><svg /></doc>'))).toBeNull()
  })

  it('skips a full prologue to reach the root tag', () => {
    const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    const doctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
    const comment = '<!-- Created with a drawing program -->'
    expect(detectImageFormat(ascii(`${declaration}\n${doctype}\n${comment}\n<svg xmlns="x"></svg>`))).toBe(
      IMAGE_FORMATS.svg,
    )
    // A doctype carrying an internal subset, whose own > must not end it,
    // followed by a self-closing root written without a space.
    expect(detectImageFormat(ascii('<!DOCTYPE svg [ <!ENTITY a "b"> ]>\n<svg/>'))).toBe(IMAGE_FORMATS.svg)
    expect(detectImageFormat(ascii('<svg/>'))).toBe(IMAGE_FORMATS.svg)
  })

  it('gives up rather than guessing when the prologue is cut off', () => {
    // The window ends mid-comment: nothing can be said about the root yet.
    expect(detectImageFormat(ascii('<!-- a comment that never ends'))).toBeNull()
  })

  it('returns null for plain text, empty input, and a truncated signature', () => {
    expect(detectImageFormat(ascii('hello world'))).toBeNull()
    expect(detectImageFormat(new Uint8Array(0))).toBeNull()
    expect(detectImageFormat(bytes(0x89, 0x50))).toBeNull()
  })
})

describe('outputFileName', () => {
  it('swaps a recognized image extension for the target one', () => {
    expect(outputFileName('screenshot.png', IMAGE_FORMATS.webp)).toBe('screenshot.webp')
    expect(outputFileName('photo.JPEG', IMAGE_FORMATS.png)).toBe('photo.png')
  })

  it('appends when the extension is not an image one', () => {
    expect(outputFileName('archive.tar', IMAGE_FORMATS.png)).toBe('archive.tar.png')
  })

  it('appends when there is no extension at all', () => {
    expect(outputFileName('scan', IMAGE_FORMATS.jpeg)).toBe('scan.jpg')
  })

  it('keeps dots inside the base name', () => {
    expect(outputFileName('logo.v2.svg', IMAGE_FORMATS.png)).toBe('logo.v2.png')
  })

  it('falls back to a generic name for a blank one', () => {
    expect(outputFileName('   ', IMAGE_FORMATS.png)).toBe('image.png')
  })
})

describe('formatFileSize', () => {
  it('shows bytes below a kilobyte', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(999)).toBe('999 B')
  })

  it('scales up to kB and MB', () => {
    expect(formatFileSize(1000)).toBe('1.00 kB')
    expect(formatFileSize(25_600)).toBe('25.6 kB')
    expect(formatFileSize(4_200_000)).toBe('4.20 MB')
  })
})

/** Test-only builders for images carrying EXIF, IPTC and XMP. The pixel data
 * is a stand-in: the widget never decodes it, only copies it through. */

import { writeChunks, type PngChunk } from '@/widgets/png-optimizer/png'
import type { ExifEntry, ExifIfd } from './exif'
import { serializeExif } from './exif'
import { serializeIptc, serializePhotoshopResources, UTF8_CHARSET } from './iptc'

const encoder = new TextEncoder()

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

export function textEntry(ifd: ExifIfd, tag: number, text: string): ExifEntry {
  const value = encoder.encode(`${text}\0`)
  return { ifd, tag, type: 2, count: value.length, value }
}

export function shortEntry(ifd: ExifIfd, tag: number, values: number[], littleEndian = true): ExifEntry {
  const value = new Uint8Array(values.length * 2)
  values.forEach((number, index) => new DataView(value.buffer).setUint16(index * 2, number, littleEndian))
  return { ifd, tag, type: 3, count: values.length, value }
}

export function rationalEntry(ifd: ExifIfd, tag: number, pairs: [number, number][], littleEndian = true): ExifEntry {
  const value = new Uint8Array(pairs.length * 8)
  const view = new DataView(value.buffer)
  pairs.forEach(([numerator, denominator], index) => {
    view.setUint32(index * 8, numerator, littleEndian)
    view.setUint32(index * 8 + 4, denominator, littleEndian)
  })
  return { ifd, tag, type: 5, count: pairs.length, value }
}

export const THUMBNAIL = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)

/** A camera-like EXIF block: make and model, exposure, a GPS fix of
 * 48°51'29.64" N 2°17'40.2" E, and a thumbnail. */
export function sampleExif(littleEndian = true): Uint8Array {
  return serializeExif({
    littleEndian,
    thumbnail: THUMBNAIL,
    entries: [
      textEntry('ifd0', 0x010f, 'Canon'),
      textEntry('ifd0', 0x0110, 'Canon EOS R6'),
      shortEntry('ifd0', 0x0112, [6], littleEndian),
      textEntry('ifd0', 0x013b, 'Jane Doe'),
      textEntry('exif', 0x9003, '2026:10:01 14:32:07'),
      rationalEntry('exif', 0x829a, [[1, 250]], littleEndian),
      rationalEntry('exif', 0x829d, [[28, 10]], littleEndian),
      shortEntry('exif', 0x8827, [400], littleEndian),
      textEntry('gps', 0x01, 'N'),
      rationalEntry(
        'gps',
        0x02,
        [
          [48, 1],
          [51, 1],
          [2964, 100],
        ],
        littleEndian,
      ),
      textEntry('gps', 0x03, 'E'),
      rationalEntry(
        'gps',
        0x04,
        [
          [2, 1],
          [17, 1],
          [402, 10],
        ],
        littleEndian,
      ),
      textEntry('interop', 0x0001, 'R98'),
      shortEntry('ifd1', 0x0103, [6], littleEndian),
    ],
  })
}

export const SAMPLE_XMP = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:exif="http://ns.adobe.com/exif/1.0/"
        xmp:CreatorTool="Lightroom"
        exif:GPSLatitude="48,51.494N">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">Eiffel Tower</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:subject>
        <rdf:Bag>
          <rdf:li>paris</rdf:li>
          <rdf:li>travel</rdf:li>
        </rdf:Bag>
      </dc:subject>
      <xmp:Rating>4</xmp:Rating>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

/** A Photoshop resource block: resolution info, IPTC (UTF-8, a caption,
 * two keywords and a city) and the IPTC digest. */
export function samplePhotoshop(): Uint8Array {
  const iptc = serializeIptc([
    { record: 1, dataset: 90, value: UTF8_CHARSET },
    { record: 2, dataset: 0, value: Uint8Array.of(0, 4) },
    { record: 2, dataset: 120, value: encoder.encode('Sunset over the Seine') },
    { record: 2, dataset: 25, value: encoder.encode('paris') },
    { record: 2, dataset: 25, value: encoder.encode('river') },
    { record: 2, dataset: 90, value: encoder.encode('Paris') },
  ])
  return serializePhotoshopResources([
    { id: 0x03ed, name: new Uint8Array(0), data: new Uint8Array(16) },
    { id: 0x0404, name: new Uint8Array(0), data: iptc },
    { id: 0x0425, name: new Uint8Array(0), data: new Uint8Array(16) },
  ])
}

export interface TestBlocks {
  exif?: Uint8Array
  xmp?: string
  photoshop?: Uint8Array
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2
  return concat([Uint8Array.of(0xff, marker, length >> 8, length & 0xff), payload])
}

/** JFIF header, then the metadata, a quantization table and a fake scan. */
export function buildJpeg(blocks: TestBlocks = {}): Uint8Array {
  const parts = [
    Uint8Array.of(0xff, 0xd8),
    segment(0xe0, concat([ascii('JFIF\0'), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0)])),
  ]
  if (blocks.exif) parts.push(segment(0xe1, concat([ascii('Exif\0\0'), blocks.exif])))
  if (blocks.xmp)
    parts.push(segment(0xe1, concat([ascii('http://ns.adobe.com/xap/1.0/\0'), encoder.encode(blocks.xmp)])))
  if (blocks.photoshop) parts.push(segment(0xed, concat([ascii('Photoshop 3.0\0'), blocks.photoshop])))
  parts.push(segment(0xdb, new Uint8Array(65)))
  parts.push(Uint8Array.of(0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0x56, 0xff, 0xd9))
  return concat(parts)
}

export function buildPng(blocks: TestBlocks = {}): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, 1)
  view.setUint32(4, 1)
  header[8] = 8
  header[9] = 6
  const chunks: PngChunk[] = [{ type: 'IHDR', data: header }]
  if (blocks.exif) chunks.push({ type: 'eXIf', data: blocks.exif })
  if (blocks.xmp) {
    chunks.push({ type: 'iTXt', data: concat([ascii('XML:com.adobe.xmp\0\0\0\0\0'), encoder.encode(blocks.xmp)]) })
  }
  chunks.push({ type: 'tEXt', data: ascii('Comment\0hello') })
  chunks.push({ type: 'IDAT', data: Uint8Array.of(1, 2, 3) }, { type: 'IEND', data: new Uint8Array(0) })
  return writeChunks(chunks)
}

function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(8)
  header.set(ascii(fourcc))
  new DataView(header.buffer).setUint32(4, data.length, true)
  return concat([header, data, data.length & 1 ? new Uint8Array(1) : new Uint8Array(0)])
}

export function buildWebp(blocks: TestBlocks = {}): Uint8Array {
  const vp8x = new Uint8Array(10)
  vp8x[0] = (blocks.exif ? 0x08 : 0) | (blocks.xmp ? 0x04 : 0)
  const body = [ascii('WEBP'), riffChunk('VP8X', vp8x), riffChunk('VP8L', Uint8Array.of(0x2f, 0, 0, 0, 0))]
  if (blocks.exif) body.push(riffChunk('EXIF', blocks.exif))
  if (blocks.xmp) body.push(riffChunk('XMP ', encoder.encode(blocks.xmp)))
  const content = concat(body)
  const header = new Uint8Array(8)
  header.set(ascii('RIFF'))
  new DataView(header.buffer).setUint32(4, content.length, true)
  return concat([header, content])
}

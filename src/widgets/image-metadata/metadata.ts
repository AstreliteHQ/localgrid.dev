import { formatFileSize } from '@/widgets/image-converter/imageFormats'
import { detectContainer, readMetadataBlocks, writeMetadataBlocks, type ContainerFormat } from './containers'
import {
  encodeExifValue,
  exifGpsPosition,
  exifNumbers,
  formatExifValue,
  isExifEditable,
  parseExif,
  serializeExif,
  type ExifEntry,
  type ExifIfd,
} from './exif'
import { exifTagName, exifValueHint, IFD_LABELS } from './exifTags'
import {
  declaresUtf8,
  formatIptcValue,
  iptcDatasetName,
  IPTC_DIGEST_RESOURCE_ID,
  IPTC_RESOURCE_ID,
  isIptcText,
  parseIptc,
  parsePhotoshopResources,
  photoshopResourceName,
  serializeIptc,
  serializePhotoshopResources,
  UTF8_CHARSET,
  type IptcDataset,
} from './iptc'
import { editXmp, parseXmp } from './xmp'

export type MetadataSection = 'exif' | 'iptc' | 'xmp'

export const SECTION_LABELS: Record<MetadataSection, string> = {
  exif: 'EXIF',
  iptc: 'IPTC',
  xmp: 'XMP',
}

export interface MetadataField {
  /** Stable for a given file: re-reading the same bytes gives the same ids. */
  id: string
  section: MetadataSection
  /** Sub-heading within the section: an IFD, an XMP namespace prefix, etc. */
  group: string
  name: string
  value: string
  /** A readable meaning for a coded value, like "Rotate 90 CW". */
  hint?: string
  editable: boolean
  /** Part of the location data "Strip GPS" removes. */
  gps: boolean
  /** Returns why `text` cannot be written to this field, or null if it can. */
  validate?: (text: string) => string | null
}

export interface ImageMetadata {
  format: ContainerFormat
  fields: MetadataField[]
  gps: { latitude: number; longitude: number } | null
  /** Blocks that were present but could not be decoded. They are kept as is. */
  errors: string[]
}

/** What the user changed, keyed by field id. Removal wins over an edit. */
export interface MetadataEdits {
  values: Record<string, string>
  removed: string[]
}

export const NO_EDITS: MetadataEdits = { values: {}, removed: [] }

const IFD_ORDER: ExifIfd[] = ['ifd0', 'exif', 'gps', 'interop', 'ifd1']
const XMP_EXIF_NAMESPACE = 'http://ns.adobe.com/exif/1.0/'

export function hasEdits(edits: MetadataEdits): boolean {
  return edits.removed.length > 0 || Object.keys(edits.values).length > 0
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function exifFields(tiff: Uint8Array): { fields: MetadataField[]; gps: ImageMetadata['gps'] } {
  const data = parseExif(tiff)
  const { littleEndian } = data
  const indexed = data.entries.map((entry, index) => ({ entry, index }))
  indexed.sort((a, b) => IFD_ORDER.indexOf(a.entry.ifd) - IFD_ORDER.indexOf(b.entry.ifd) || a.entry.tag - b.entry.tag)
  const fields: MetadataField[] = indexed.map(({ entry, index }) => {
    const numeric = entry.type !== 2 && entry.type !== 7 && entry.count <= 4
    return {
      id: `exif:${index}`,
      section: 'exif',
      group: IFD_LABELS[entry.ifd],
      name: exifTagName(entry.ifd, entry.tag),
      value: formatExifValue(entry, littleEndian),
      hint: numeric ? exifValueHint(entry.ifd, entry.tag, exifNumbers(entry, littleEndian)) : undefined,
      editable: isExifEditable(entry),
      gps: entry.ifd === 'gps',
      validate: (text) => {
        try {
          encodeExifValue(entry, text, littleEndian)
          return null
        } catch (cause) {
          return message(cause)
        }
      },
    }
  })
  if (data.thumbnail) {
    fields.push({
      id: 'exif:thumbnail',
      section: 'exif',
      group: IFD_LABELS.ifd1,
      name: 'ThumbnailImage',
      value: `${formatFileSize(data.thumbnail.length)} embedded preview`,
      editable: false,
      gps: false,
    })
  }
  return { fields, gps: exifGpsPosition(data) }
}

function photoshopFields(irb: Uint8Array): MetadataField[] {
  const fields: MetadataField[] = []
  parsePhotoshopResources(irb).forEach((resource, resourceIndex) => {
    if (resource.id === IPTC_RESOURCE_ID) {
      const datasets = parseIptc(resource.data)
      const utf8 = declaresUtf8(datasets)
      datasets.forEach((dataset, index) => {
        fields.push({
          id: `iptc:${index}`,
          section: 'iptc',
          group: 'IPTC',
          name: iptcDatasetName(dataset.record, dataset.dataset),
          value: formatIptcValue(dataset, utf8),
          editable: isIptcText(dataset),
          gps: false,
        })
      })
    } else if (resource.id !== IPTC_DIGEST_RESOURCE_ID) {
      fields.push({
        id: `irb:${resourceIndex}`,
        section: 'iptc',
        group: 'Photoshop',
        name: photoshopResourceName(resource.id),
        value: formatFileSize(resource.data.length),
        editable: false,
        gps: false,
      })
    }
  })
  // IPTC first: it is what people come for, the other resources are noise.
  return fields.sort((a, b) => Number(a.group === 'Photoshop') - Number(b.group === 'Photoshop'))
}

function xmpFields(packet: string): MetadataField[] {
  return parseXmp(packet).map((property) => ({
    id: `xmp:${property.index}`,
    section: 'xmp',
    group: property.prefix || 'XMP',
    name: property.name,
    value: property.value,
    editable: property.editable,
    gps: property.namespace === XMP_EXIF_NAMESPACE && property.name.split(':').pop()!.startsWith('GPS'),
  }))
}

export function readImageMetadata(bytes: Uint8Array): ImageMetadata {
  const format = detectContainer(bytes)
  if (!format) throw new Error('Only JPEG, PNG and WebP images are supported.')
  const blocks = readMetadataBlocks(bytes, format)
  const fields: MetadataField[] = []
  const errors: string[] = []
  let gps: ImageMetadata['gps'] = null
  if (blocks.exif) {
    try {
      const exif = exifFields(blocks.exif)
      fields.push(...exif.fields)
      gps = exif.gps
    } catch (cause) {
      errors.push(`EXIF: ${message(cause)}`)
    }
  }
  if (blocks.photoshop) fields.push(...photoshopFields(blocks.photoshop))
  if (blocks.xmp !== null) {
    try {
      fields.push(...xmpFields(blocks.xmp))
    } catch (cause) {
      errors.push(`XMP: ${message(cause)}`)
    }
  }
  return { format, fields, gps, errors }
}

function editExif(tiff: Uint8Array, values: Record<string, string>, removed: Set<string>): Uint8Array | null {
  const data = parseExif(tiff)
  const dropThumbnail = removed.has('exif:thumbnail')
  const entries: ExifEntry[] = []
  data.entries.forEach((entry, index) => {
    const id = `exif:${index}`
    if (removed.has(id) || (dropThumbnail && entry.ifd === 'ifd1')) return
    entries.push(id in values ? encodeExifValue(entry, values[id], data.littleEndian) : entry)
  })
  const thumbnail = dropThumbnail ? null : data.thumbnail
  if (entries.length === 0 && !thumbnail) return null
  return serializeExif({ ...data, entries, thumbnail })
}

const textEncoder = new TextEncoder()

function editIptc(datasets: IptcDataset[], values: Record<string, string>, removed: Set<string>): IptcDataset[] {
  let utf8 = declaresUtf8(datasets)
  const needsUtf8 = Object.entries(values).some(([id, text]) => id.startsWith('iptc:') && /[^ -~\t\r\n]/.test(text))
  let next = datasets
  if (needsUtf8 && !utf8) {
    // Without a declared charset readers assume Latin-1, which cannot hold
    // arbitrary text, so the record is switched to UTF-8 as a whole.
    const latin1 = new TextDecoder('latin1')
    next = datasets.map((dataset) =>
      isIptcText(dataset) ? { ...dataset, value: textEncoder.encode(latin1.decode(dataset.value)) } : dataset,
    )
    utf8 = true
  }
  const edited = next.flatMap((dataset, index) => {
    const id = `iptc:${index}`
    if (removed.has(id)) return []
    if (!(id in values)) return [dataset]
    const value = utf8 ? textEncoder.encode(values[id]) : Uint8Array.from(values[id], (char) => char.charCodeAt(0))
    return [{ ...dataset, value }]
  })
  if (utf8 && !declaresUtf8(edited) && edited.length > 0) {
    edited.unshift({ record: 1, dataset: 90, value: UTF8_CHARSET })
  }
  return edited
}

function editPhotoshop(irb: Uint8Array, values: Record<string, string>, removed: Set<string>): Uint8Array | null {
  const resources = parsePhotoshopResources(irb).flatMap((resource, index) => {
    if (removed.has(`irb:${index}`) || resource.id === IPTC_DIGEST_RESOURCE_ID) return []
    if (resource.id !== IPTC_RESOURCE_ID) return [resource]
    const datasets = editIptc(parseIptc(resource.data), values, removed)
    // A lone charset marker is not worth keeping once every field is gone.
    if (datasets.every((dataset) => dataset.record === 1 && dataset.dataset === 90)) return []
    return [{ ...resource, data: serializeIptc(datasets) }]
  })
  return resources.length > 0 ? serializePhotoshopResources(resources) : null
}

function touches(section: string[], edits: MetadataEdits): boolean {
  const prefixed = (id: string) => section.some((prefix) => id.startsWith(prefix))
  return edits.removed.some(prefixed) || Object.keys(edits.values).some(prefixed)
}

/** Writes the edits into a copy of the image. Blocks no edit touches are
 * copied through byte for byte, and the image data itself always is. */
export function applyMetadataEdits(bytes: Uint8Array, edits: MetadataEdits): Uint8Array {
  const format = detectContainer(bytes)
  if (!format) throw new Error('Only JPEG, PNG and WebP images are supported.')
  if (!hasEdits(edits)) return bytes
  const blocks = readMetadataBlocks(bytes, format)
  const removed = new Set(edits.removed)
  const next = { ...blocks }
  if (blocks.exif && touches(['exif:'], edits)) next.exif = editExif(blocks.exif, edits.values, removed)
  if (blocks.photoshop && touches(['iptc:', 'irb:'], edits)) {
    next.photoshop = editPhotoshop(blocks.photoshop, edits.values, removed)
  }
  if (blocks.xmp !== null && touches(['xmp:'], edits)) {
    const values = new Map<number, string>()
    const removedIndexes = new Set<number>()
    for (const [id, text] of Object.entries(edits.values))
      if (id.startsWith('xmp:')) values.set(Number(id.slice(4)), text)
    for (const id of removed) if (id.startsWith('xmp:')) removedIndexes.add(Number(id.slice(4)))
    next.xmp = editXmp(blocks.xmp, values, removedIndexes)
  }
  return writeMetadataBlocks(bytes, format, next)
}

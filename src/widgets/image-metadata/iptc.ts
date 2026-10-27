/** IPTC IIM datasets, and the Photoshop image resource block (IRB) that
 * carries them inside a JPEG's APP13 segment. */

export interface PhotoshopResource {
  id: number
  /** Pascal string name, almost always empty. */
  name: Uint8Array
  data: Uint8Array
}

export interface IptcDataset {
  record: number
  dataset: number
  value: Uint8Array
}

export const IPTC_RESOURCE_ID = 0x0404
/** MD5 of the IPTC block. Stale once IPTC changes, so it is dropped then. */
export const IPTC_DIGEST_RESOURCE_ID = 0x0425

const RESOURCE_SIGNATURE = '8BIM'

export function parsePhotoshopResources(bytes: Uint8Array): PhotoshopResource[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const resources: PhotoshopResource[] = []
  let offset = 0
  while (offset + 12 <= bytes.length) {
    if (String.fromCharCode(...bytes.subarray(offset, offset + 4)) !== RESOURCE_SIGNATURE) break
    const id = view.getUint16(offset + 4)
    const nameLength = bytes[offset + 6]
    // The name, length byte included, is padded to an even size.
    const nameEnd = offset + 6 + ((nameLength + 2) & ~1)
    if (nameEnd + 4 > bytes.length) break
    const size = view.getUint32(nameEnd)
    const dataStart = nameEnd + 4
    if (dataStart + size > bytes.length) break
    resources.push({
      id,
      name: bytes.slice(offset + 7, offset + 7 + nameLength),
      data: bytes.slice(dataStart, dataStart + size),
    })
    offset = dataStart + size + (size & 1)
  }
  return resources
}

export function serializePhotoshopResources(resources: PhotoshopResource[]): Uint8Array {
  const parts: number[] = []
  for (const resource of resources) {
    for (const char of RESOURCE_SIGNATURE) parts.push(char.charCodeAt(0))
    parts.push(resource.id >> 8, resource.id & 0xff, resource.name.length, ...resource.name)
    if ((resource.name.length + 1) & 1) parts.push(0)
    const size = resource.data.length
    parts.push((size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff)
    for (const byte of resource.data) parts.push(byte)
    if (size & 1) parts.push(0)
  }
  return Uint8Array.from(parts)
}

export function parseIptc(bytes: Uint8Array): IptcDataset[] {
  const datasets: IptcDataset[] = []
  let offset = 0
  while (offset + 5 <= bytes.length && bytes[offset] === 0x1c) {
    const record = bytes[offset + 1]
    const dataset = bytes[offset + 2]
    let size = (bytes[offset + 3] << 8) | bytes[offset + 4]
    let start = offset + 5
    if (size & 0x8000) {
      // Extended dataset: the low bits give how many bytes hold the size.
      const lengthBytes = size & 0x7fff
      size = 0
      for (let index = 0; index < lengthBytes; index += 1) size = size * 256 + bytes[start + index]
      start += lengthBytes
    }
    if (start + size > bytes.length) break
    datasets.push({ record, dataset, value: bytes.slice(start, start + size) })
    offset = start + size
  }
  return datasets
}

export function serializeIptc(datasets: IptcDataset[]): Uint8Array {
  const parts: number[] = []
  for (const { record, dataset, value } of datasets) {
    parts.push(0x1c, record, dataset)
    if (value.length < 0x8000) {
      parts.push(value.length >> 8, value.length & 0xff)
    } else {
      parts.push(0x80, 4, (value.length >>> 24) & 0xff, (value.length >>> 16) & 0xff, (value.length >>> 8) & 0xff)
      parts.push(value.length & 0xff)
    }
    for (const byte of value) parts.push(byte)
  }
  return Uint8Array.from(parts)
}

/** 1:90 holding `ESC % G` declares the text datasets as UTF-8. */
export const UTF8_CHARSET = Uint8Array.of(0x1b, 0x25, 0x47)

export function declaresUtf8(datasets: IptcDataset[]): boolean {
  const charset = datasets.find((item) => item.record === 1 && item.dataset === 90)
  return !!charset && charset.value.length === 3 && charset.value.every((byte, index) => byte === UTF8_CHARSET[index])
}

const ENVELOPE_NAMES: Record<number, string> = {
  0: 'EnvelopeRecordVersion',
  5: 'Destination',
  20: 'FileFormat',
  22: 'FileVersion',
  30: 'ServiceIdentifier',
  40: 'EnvelopeNumber',
  50: 'ProductID',
  60: 'EnvelopePriority',
  70: 'DateSent',
  80: 'TimeSent',
  90: 'CodedCharacterSet',
  100: 'UniqueObjectName',
}

const APPLICATION_NAMES: Record<number, string> = {
  0: 'ApplicationRecordVersion',
  3: 'ObjectTypeReference',
  4: 'ObjectAttributeReference',
  5: 'ObjectName',
  7: 'EditStatus',
  10: 'Urgency',
  12: 'SubjectReference',
  15: 'Category',
  20: 'SupplementalCategories',
  22: 'FixtureIdentifier',
  25: 'Keywords',
  26: 'ContentLocationCode',
  27: 'ContentLocationName',
  30: 'ReleaseDate',
  35: 'ReleaseTime',
  37: 'ExpirationDate',
  38: 'ExpirationTime',
  40: 'SpecialInstructions',
  42: 'ActionAdvised',
  45: 'ReferenceService',
  47: 'ReferenceDate',
  50: 'ReferenceNumber',
  55: 'DateCreated',
  60: 'TimeCreated',
  62: 'DigitalCreationDate',
  63: 'DigitalCreationTime',
  65: 'OriginatingProgram',
  70: 'ProgramVersion',
  75: 'ObjectCycle',
  80: 'By-line',
  85: 'By-lineTitle',
  90: 'City',
  92: 'Sub-location',
  95: 'Province-State',
  100: 'Country-PrimaryLocationCode',
  101: 'Country-PrimaryLocationName',
  103: 'OriginalTransmissionReference',
  105: 'Headline',
  110: 'Credit',
  115: 'Source',
  116: 'CopyrightNotice',
  118: 'Contact',
  120: 'Caption-Abstract',
  121: 'LocalCaption',
  122: 'Writer-Editor',
  130: 'ImageType',
  131: 'ImageOrientation',
  135: 'LanguageIdentifier',
}

export function iptcDatasetName(record: number, dataset: number): string {
  const names = record === 1 ? ENVELOPE_NAMES : record === 2 ? APPLICATION_NAMES : {}
  return names[dataset] ?? `Dataset ${record}:${dataset}`
}

/** Version numbers, file format codes and the charset marker are binary;
 * everything else in the envelope and application records is text. */
export function isIptcText(dataset: IptcDataset): boolean {
  if (dataset.record === 1) return ![0, 20, 22, 90].includes(dataset.dataset)
  return dataset.record === 2 && dataset.dataset !== 0
}

export function formatIptcValue(dataset: IptcDataset, utf8: boolean): string {
  if (dataset.record === 1 && dataset.dataset === 90) return declaresUtf8([dataset]) ? 'UTF-8' : 'Other'
  if (!isIptcText(dataset)) {
    if (dataset.value.length === 2) return String((dataset.value[0] << 8) | dataset.value[1])
    return `${dataset.value.length} bytes of binary data`
  }
  return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(dataset.value)
}

const PHOTOSHOP_RESOURCE_NAMES: Record<number, string> = {
  0x03e9: 'PrintInfo',
  0x03ed: 'ResolutionInfo',
  0x03f3: 'PrintFlags',
  0x0404: 'IPTC',
  0x0406: 'JPEGQuality',
  0x0408: 'GridGuides',
  0x040a: 'CopyrightFlag',
  0x040b: 'URL',
  0x040c: 'PhotoshopThumbnail',
  0x040f: 'ICCProfile',
  0x0411: 'ICCUntagged',
  0x0414: 'IDsBaseValue',
  0x041a: 'Slices',
  0x041e: 'URLList',
  0x0421: 'VersionInfo',
  0x0422: 'EXIFInfo',
  0x0424: 'XMP',
  0x0425: 'IPTCDigest',
  0x0426: 'PrintScaleInfo',
  0x0428: 'PixelInfo',
  0x043a: 'PrintInfo2',
  0x043b: 'PrintStyle',
}

export function photoshopResourceName(id: number): string {
  return PHOTOSHOP_RESOURCE_NAMES[id] ?? `Resource 0x${id.toString(16).padStart(4, '0')}`
}

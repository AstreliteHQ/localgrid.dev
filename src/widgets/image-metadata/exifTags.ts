import type { ExifIfd } from './exif'

/** Tag names as ExifTool and the EXIF 2.32 spec spell them, for the tags
 * people actually meet. Anything else is shown by its hex id. */
const IMAGE_TAGS: Record<number, string> = {
  0x0100: 'ImageWidth',
  0x0101: 'ImageHeight',
  0x0102: 'BitsPerSample',
  0x0103: 'Compression',
  0x0106: 'PhotometricInterpretation',
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0111: 'StripOffsets',
  0x0112: 'Orientation',
  0x0115: 'SamplesPerPixel',
  0x0116: 'RowsPerStrip',
  0x0117: 'StripByteCounts',
  0x011a: 'XResolution',
  0x011b: 'YResolution',
  0x011c: 'PlanarConfiguration',
  0x0128: 'ResolutionUnit',
  0x012d: 'TransferFunction',
  0x0131: 'Software',
  0x0132: 'ModifyDate',
  0x013b: 'Artist',
  0x013c: 'HostComputer',
  0x013e: 'WhitePoint',
  0x013f: 'PrimaryChromaticities',
  0x0211: 'YCbCrCoefficients',
  0x0212: 'YCbCrSubSampling',
  0x0213: 'YCbCrPositioning',
  0x0214: 'ReferenceBlackWhite',
  0x4746: 'Rating',
  0x4749: 'RatingPercent',
  0x8298: 'Copyright',
  0x9c9b: 'XPTitle',
  0x9c9c: 'XPComment',
  0x9c9d: 'XPAuthor',
  0x9c9e: 'XPKeywords',
  0x9c9f: 'XPSubject',
  0xc4a5: 'PrintIM',
}

const PHOTO_TAGS: Record<number, string> = {
  0x829a: 'ExposureTime',
  0x829d: 'FNumber',
  0x8822: 'ExposureProgram',
  0x8824: 'SpectralSensitivity',
  0x8827: 'ISO',
  0x8830: 'SensitivityType',
  0x8832: 'RecommendedExposureIndex',
  0x9000: 'ExifVersion',
  0x9003: 'DateTimeOriginal',
  0x9004: 'CreateDate',
  0x9010: 'OffsetTime',
  0x9011: 'OffsetTimeOriginal',
  0x9012: 'OffsetTimeDigitized',
  0x9101: 'ComponentsConfiguration',
  0x9102: 'CompressedBitsPerPixel',
  0x9201: 'ShutterSpeedValue',
  0x9202: 'ApertureValue',
  0x9203: 'BrightnessValue',
  0x9204: 'ExposureCompensation',
  0x9205: 'MaxApertureValue',
  0x9206: 'SubjectDistance',
  0x9207: 'MeteringMode',
  0x9208: 'LightSource',
  0x9209: 'Flash',
  0x920a: 'FocalLength',
  0x9214: 'SubjectArea',
  0x927c: 'MakerNote',
  0x9286: 'UserComment',
  0x9290: 'SubSecTime',
  0x9291: 'SubSecTimeOriginal',
  0x9292: 'SubSecTimeDigitized',
  0xa000: 'FlashpixVersion',
  0xa001: 'ColorSpace',
  0xa002: 'ExifImageWidth',
  0xa003: 'ExifImageHeight',
  0xa004: 'RelatedSoundFile',
  0xa20e: 'FocalPlaneXResolution',
  0xa20f: 'FocalPlaneYResolution',
  0xa210: 'FocalPlaneResolutionUnit',
  0xa215: 'ExposureIndex',
  0xa217: 'SensingMethod',
  0xa300: 'FileSource',
  0xa301: 'SceneType',
  0xa302: 'CFAPattern',
  0xa401: 'CustomRendered',
  0xa402: 'ExposureMode',
  0xa403: 'WhiteBalance',
  0xa404: 'DigitalZoomRatio',
  0xa405: 'FocalLengthIn35mmFormat',
  0xa406: 'SceneCaptureType',
  0xa407: 'GainControl',
  0xa408: 'Contrast',
  0xa409: 'Saturation',
  0xa40a: 'Sharpness',
  0xa40c: 'SubjectDistanceRange',
  0xa420: 'ImageUniqueID',
  0xa430: 'OwnerName',
  0xa431: 'SerialNumber',
  0xa432: 'LensInfo',
  0xa433: 'LensMake',
  0xa434: 'LensModel',
  0xa435: 'LensSerialNumber',
  0xa460: 'CompositeImage',
}

const GPS_TAGS: Record<number, string> = {
  0x00: 'GPSVersionID',
  0x01: 'GPSLatitudeRef',
  0x02: 'GPSLatitude',
  0x03: 'GPSLongitudeRef',
  0x04: 'GPSLongitude',
  0x05: 'GPSAltitudeRef',
  0x06: 'GPSAltitude',
  0x07: 'GPSTimeStamp',
  0x08: 'GPSSatellites',
  0x09: 'GPSStatus',
  0x0a: 'GPSMeasureMode',
  0x0b: 'GPSDOP',
  0x0c: 'GPSSpeedRef',
  0x0d: 'GPSSpeed',
  0x0e: 'GPSTrackRef',
  0x0f: 'GPSTrack',
  0x10: 'GPSImgDirectionRef',
  0x11: 'GPSImgDirection',
  0x12: 'GPSMapDatum',
  0x13: 'GPSDestLatitudeRef',
  0x14: 'GPSDestLatitude',
  0x15: 'GPSDestLongitudeRef',
  0x16: 'GPSDestLongitude',
  0x17: 'GPSDestBearingRef',
  0x18: 'GPSDestBearing',
  0x19: 'GPSDestDistanceRef',
  0x1a: 'GPSDestDistance',
  0x1b: 'GPSProcessingMethod',
  0x1c: 'GPSAreaInformation',
  0x1d: 'GPSDateStamp',
  0x1e: 'GPSDifferential',
  0x1f: 'GPSHPositioningError',
}

const INTEROP_TAGS: Record<number, string> = {
  0x0001: 'InteropIndex',
  0x0002: 'InteropVersion',
}

const TAGS_BY_IFD: Record<ExifIfd, Record<number, string>> = {
  ifd0: IMAGE_TAGS,
  exif: PHOTO_TAGS,
  gps: GPS_TAGS,
  interop: INTEROP_TAGS,
  ifd1: IMAGE_TAGS,
}

export const IFD_LABELS: Record<ExifIfd, string> = {
  ifd0: 'Image',
  exif: 'Photo',
  gps: 'GPS',
  interop: 'Interoperability',
  ifd1: 'Thumbnail',
}

export function exifTagName(ifd: ExifIfd, tag: number): string {
  return TAGS_BY_IFD[ifd][tag] ?? `Tag 0x${tag.toString(16).padStart(4, '0')}`
}

/** Readable meanings for the enumerated tags whose raw numbers say nothing
 * on their own. Keyed by tag id in the IFD it lives in. */
const ENUM_HINTS: Partial<Record<ExifIfd, Record<number, Record<number, string>>>> = {
  ifd0: {
    0x0112: {
      1: 'Horizontal (normal)',
      2: 'Mirror horizontal',
      3: 'Rotate 180',
      4: 'Mirror vertical',
      5: 'Mirror horizontal and rotate 270 CW',
      6: 'Rotate 90 CW',
      7: 'Mirror horizontal and rotate 90 CW',
      8: 'Rotate 270 CW',
    },
    0x0128: { 1: 'None', 2: 'inches', 3: 'cm' },
  },
  exif: {
    0x8822: {
      0: 'Not defined',
      1: 'Manual',
      2: 'Program AE',
      3: 'Aperture priority',
      4: 'Shutter priority',
      5: 'Creative',
      6: 'Action',
      7: 'Portrait',
      8: 'Landscape',
    },
    0x9207: {
      0: 'Unknown',
      1: 'Average',
      2: 'Center-weighted average',
      3: 'Spot',
      4: 'Multi-spot',
      5: 'Multi-segment',
      6: 'Partial',
      255: 'Other',
    },
    0xa001: { 1: 'sRGB', 2: 'Adobe RGB', 0xffff: 'Uncalibrated' },
    0xa402: { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' },
    0xa403: { 0: 'Auto', 1: 'Manual' },
    0xa406: { 0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night' },
  },
  gps: {
    0x05: { 0: 'Above sea level', 1: 'Below sea level' },
  },
}

export function exifValueHint(ifd: ExifIfd, tag: number, values: number[]): string | undefined {
  if (ifd === 'exif' && tag === 0x9209 && values.length === 1) {
    return values[0] & 1 ? 'Fired' : 'Did not fire'
  }
  const table = ENUM_HINTS[ifd === 'ifd1' ? 'ifd0' : ifd]?.[tag]
  if (!table || values.length !== 1) return undefined
  return table[values[0]]
}

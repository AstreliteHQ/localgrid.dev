/** Canvas-backed image re-encoding for the Image Converter widget.
 *
 * Everything runs in the browser: the source file is decoded by the
 * browser's own image pipeline, painted onto an offscreen canvas, and
 * re-encoded through `canvas.toBlob`. Nothing is uploaded anywhere. */

import type { ImageFormat } from './imageFormats'

export interface ConversionResult {
  blob: Blob
  width: number
  height: number
}

export interface ConvertOptions {
  /** 0..1, only honoured by lossy encoders (JPEG, WebP, AVIF). */
  quality: number
  /** Painted under the image when the target has no alpha channel, so
   * transparent areas don't come out black. */
  matte: string
}

/** Longest edge, in pixels, an SVG is rasterized at when its own intrinsic
 * size would produce a thumbnail. A vector file can declare only a viewBox,
 * and browsers then fall back to a small default (Firefox reports 0x0,
 * Chromium a 150px-tall box scaled to the viewBox ratio). Neither makes a
 * usable bitmap, so a detected SVG is scaled up to this on its longest
 * edge; the aspect ratio the browser derived is kept. */
const DEFAULT_VECTOR_SIZE = 1024

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

function decodeWithImageElement(file: File, source: ImageFormat): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    // The source format comes from the file's bytes, not from `file.type`,
    // which is routinely empty or wrong. An object URL inherits that wrong
    // type, and an <img> refuses SVG data served as `application/octet-
    // stream`, so the blob is re-typed from what was actually detected.
    const blob = file.type === source.mimeType ? file : new Blob([file], { type: source.mimeType })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const intrinsicWidth = image.naturalWidth
      const intrinsicHeight = image.naturalHeight
      const longestEdge = Math.max(intrinsicWidth, intrinsicHeight)
      // Only vector sources are scaled: a raster image is converted at the
      // size it actually has.
      const scale = source.id === 'svg' && longestEdge > 0 ? Math.max(1, DEFAULT_VECTOR_SIZE / longestEdge) : 1
      const width = Math.round(intrinsicWidth * scale) || DEFAULT_VECTOR_SIZE
      const height = Math.round(intrinsicHeight * scale) || DEFAULT_VECTOR_SIZE
      resolve({ source: image, width, height, release: () => URL.revokeObjectURL(url) })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This browser could not decode that image.'))
    }
    image.src = url
  })
}

/** `createImageBitmap` is the fast path and the only one that handles
 * things like animated WebP frames consistently, but it refuses SVG in
 * several browsers, so an `<img>` decode stays as the fallback. Which path
 * an SVG takes is decided by the detected format rather than by
 * `file.type`, for the same reason the blob is re-typed above. */
async function decode(file: File, source: ImageFormat): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function' && source.id !== 'svg') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall through to the <img> path rather than failing outright.
    }
  }
  return decodeWithImageElement(file, source)
}

function encode(canvas: HTMLCanvasElement, format: ImageFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error(`This browser cannot encode ${format.label}.`))
      },
      format.mimeType,
      format.lossy ? quality : undefined,
    )
  })
}

/** Decodes `file`, which was identified as `source` by its own bytes, and
 * re-encodes it as `format`. Rejects with a user-presentable message when
 * the source can't be decoded or the target can't be encoded. */
export async function convertImage(
  file: File,
  source: ImageFormat,
  format: ImageFormat,
  options: ConvertOptions,
): Promise<ConversionResult> {
  const decoded = await decode(file, source)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = decoded.width
    canvas.height = decoded.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser does not support canvas rendering.')
    if (!format.supportsAlpha) {
      context.fillStyle = options.matte
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
    const blob = await encode(canvas, format, options.quality)
    // A canvas handed an unsupported type quietly encodes a PNG instead,
    // which would otherwise be saved under the wrong extension.
    if (blob.type !== format.mimeType) {
      throw new Error(`This browser cannot encode ${format.label}.`)
    }
    return { blob, width: canvas.width, height: canvas.height }
  } finally {
    decoded.release()
  }
}

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

/** Longest edge, in pixels, an SVG with no intrinsic size is rasterized
 * at. Vector sources can declare only a viewBox, in which case the browser
 * reports a 0x0 (Firefox) or 150x300 (Chrome) intrinsic size, and neither
 * makes a usable bitmap. */
const DEFAULT_VECTOR_SIZE = 1024

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || DEFAULT_VECTOR_SIZE
      const height = image.naturalHeight || DEFAULT_VECTOR_SIZE
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
 * several browsers, so an `<img>` decode stays as the fallback. */
async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall through to the <img> path rather than failing outright.
    }
  }
  return decodeWithImageElement(file)
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

/** Decodes `file` and re-encodes it as `format`. Rejects with a
 * user-presentable message when the source can't be decoded or the target
 * can't be encoded. */
export async function convertImage(
  file: File,
  format: ImageFormat,
  options: ConvertOptions,
): Promise<ConversionResult> {
  const decoded = await decode(file)
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

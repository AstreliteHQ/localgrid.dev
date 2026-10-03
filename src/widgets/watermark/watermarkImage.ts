/** Canvas-backed image watermarking for the Watermark widget.
 *
 * Everything runs in the browser: the source file is decoded by the
 * browser's own image pipeline, painted onto an offscreen canvas with the
 * watermark text drawn diagonally over it, and re-encoded as PNG. Nothing
 * is uploaded anywhere. Always outputs PNG regardless of the source
 * format — simpler than carrying the source format through, and lossless
 * so the watermark itself stays crisp. */

import type { WatermarkPosition } from './watermarkPdf'

export interface WatermarkOptions {
  text: string
  /** 0..1 */
  opacity: number
  /** Any valid canvas `fillStyle` color. */
  color: string
  fontSize: number
  position: WatermarkPosition
}

export interface WatermarkImageResult {
  blob: Blob
  width: number
  height: number
}

function drawStampAt(context: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  context.save()
  context.translate(x, y)
  context.rotate(-Math.PI / 4)
  context.fillText(text, 0, 0)
  context.restore()
}

/** Decodes `file` as an image, stamps `options.text` across it diagonally
 * (once through the center, or repeated in a tiled grid), and re-encodes
 * the result as PNG. Rejects if the browser can't decode the file as an
 * image, or can't encode PNG. */
export async function watermarkImage(file: File, options: WatermarkOptions): Promise<WatermarkImageResult> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser does not support canvas rendering.')

    context.drawImage(bitmap, 0, 0)

    context.globalAlpha = options.opacity
    context.fillStyle = options.color
    context.font = `bold ${options.fontSize}px sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    if (options.position === 'center') {
      drawStampAt(context, options.text, canvas.width / 2, canvas.height / 2)
    } else {
      const textWidth = context.measureText(options.text).width
      const stepX = textWidth + options.fontSize * 2
      const stepY = options.fontSize * 4
      for (let y = 0; y < canvas.height + stepY; y += stepY) {
        for (let x = 0; x < canvas.width + stepX; x += stepX) drawStampAt(context, options.text, x, y)
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('This browser cannot encode PNG.'))
      }, 'image/png')
    })
    return { blob, width: canvas.width, height: canvas.height }
  } finally {
    bitmap.close()
  }
}

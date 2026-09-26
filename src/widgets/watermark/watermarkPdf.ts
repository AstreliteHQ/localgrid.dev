/** Pure PDF-watermarking logic behind the Watermark widget — no DOM, no
 * widget state, just a file (and watermark settings) in, stamped PDF bytes
 * out. */

import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export type WatermarkPosition = 'center' | 'tiled'

export interface WatermarkOptions {
  text: string
  /** 0..1 */
  opacity: number
  /** `#rrggbb` */
  color: string
  fontSize: number
  position: WatermarkPosition
}

/** `#rrggbb` → each channel as 0..1, the range pdf-lib's `rgb()` (and
 * canvas's `fillStyle`, for the image side of this widget) both avoid
 * needing any further conversion for. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255
  return { r, g, b }
}

/** Stamps `options.text` across every page of `file`, diagonally, either
 * once through the center or repeated in a tiled grid — the two common
 * "confidential stamp" layouts. Throws if `file` isn't a readable PDF. */
export async function watermarkPdf(file: File, options: WatermarkOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const { r, g, b } = hexToRgb01(options.color)
  const textWidth = font.widthOfTextAtSize(options.text, options.fontSize)

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const draw = (x: number, y: number) =>
      page.drawText(options.text, {
        x,
        y,
        size: options.fontSize,
        font,
        color: rgb(r, g, b),
        opacity: options.opacity,
        rotate: degrees(45),
      })

    if (options.position === 'center') {
      draw(width / 2 - textWidth / 2, height / 2)
      continue
    }

    // Tiled: a grid wide/tall enough that the 45° rotation still covers
    // every corner, starting off-page so the pattern isn't clipped to a
    // visibly different phase near the edges.
    const stepX = textWidth + options.fontSize * 2
    const stepY = options.fontSize * 4
    for (let y = -height; y < height * 2; y += stepY) {
      for (let x = -width; x < width * 2; x += stepX) draw(x, y)
    }
  }

  return doc.save()
}

/** Browser side of the SVG export actions: rasterize to PNG and save a file.
 * Written for any widget that produces an SVG string, not only the Icon
 * Picker. */

/** Draws an SVG string onto a canvas `width` x `height` px and encodes it as
 * PNG. The SVG goes through a data: URL, which the Content-Security-Policy
 * allows for images. */
export function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas is not available'))
        return
      }
      context.drawImage(image, 0, 0, width, height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
    }
    image.onerror = () => reject(new Error('Could not draw the SVG'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Saves a blob under `fileName` through a temporary object URL. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revoked on the next task: the click has started the download by then.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Copies a PNG to the clipboard. Takes the pending blob rather than an
 * awaited one: Safari only allows the write inside the click's own call
 * stack, so the ClipboardItem gets the promise and the browser waits on the
 * encode (same approach as QrCodeWidget). */
export async function copyPngToClipboard(blob: Promise<Blob>): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    throw new Error('Copying images is not supported in this browser')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

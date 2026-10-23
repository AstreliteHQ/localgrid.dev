/** Pure helpers behind ScratchpadWidget: deciding when a paste or drop is
 * an image, turning those images into data URLs the note can hold on its
 * own, and building the standalone HTML that "Copy" and "Download" export. */

export const DOWNLOAD_FILENAME = 'scratchpad.html'

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Minimal slice of `DataTransfer` the paste/drop path reads, so tests can
 * pass a plain object (jsdom has no `DataTransfer` constructor). */
export interface TransferLike {
  files: ArrayLike<File>
  getData: (type: string) => string
}

/** The image files a paste or drop should insert, or an empty array when
 * the editor should handle it as regular text/HTML instead.
 *
 * A screenshot arrives as a bare `image/png` file. Copying a picture from a
 * web page adds an `<img>` in `text/html` alongside the file, and using the
 * file keeps the note working offline instead of pointing at a remote URL.
 * Word, Excel and similar apps also attach a rendered picture of the copied
 * text, though, so a paste that carries real plain text stays a text paste. */
export function pickImageFiles(transfer: TransferLike | null): File[] {
  if (!transfer) return []
  const images = Array.from(transfer.files).filter(isImageFile)
  if (images.length === 0) return []
  if (transfer.getData('text/plain').trim() !== '') return []
  return images
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'))
    reader.readAsDataURL(file)
  })
}

/** Decodes a base64 `data:` URL into a Blob without a network round trip. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('Not a data URL')
  const [, type, base64, payload] = match
  if (!base64) return new Blob([decodeURIComponent(payload)], { type })
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** PNG is the only image type every browser lets `navigator.clipboard.write`
 * take (see clipboardFormats.ts), so a pasted JPEG or WebP is re-encoded
 * through a canvas before it goes back on the clipboard. */
export async function toPngBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:image/png')) return dataUrlToBlob(src)
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = src
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.drawImage(image, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/png')
  })
}

/** Inline styles rather than a stylesheet, so the formatting survives being
 * pasted into mail clients and docs editors that drop `<style>` blocks. */
const DOCUMENT_STYLES = `
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.55; color: #0f172a; max-width: 820px; margin: 2rem auto; padding: 0 1rem; }
  h1, h2, h3 { line-height: 1.25; margin: 1.4em 0 0.5em; }
  p { margin: 0 0 0.75em; }
  img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e2e8f0; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 4px; }
  pre { background: #f1f5f9; padding: 0.75em 1em; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0 0 0.75em; padding-left: 1em; border-left: 3px solid #cbd5e1; color: #475569; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
`

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Wraps the editor's HTML in a standalone document. Images are already
 * `data:` URLs, so the file opens offline with nothing next to it. */
export function buildHtmlDocument(bodyHtml: string, title = 'Scratchpad'): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${DOCUMENT_STYLES}</style>`,
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/** First heading or line of text, used to title the downloaded document. */
export function deriveTitle(plainText: string): string {
  const firstLine = plainText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '')
  if (!firstLine) return 'Scratchpad'
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
}

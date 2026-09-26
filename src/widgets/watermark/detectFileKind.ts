/** Tells a PDF apart from an image by its own bytes rather than trusting
 * `file.type`/its extension (both are routinely wrong or missing on a
 * dragged file) — the same "sniff, don't trust metadata" approach
 * ImageConverterWidget uses for image formats. Anything that isn't a PDF is
 * assumed to be an image; the actual decode step is what catches a file
 * that's neither. */

export type FileKind = 'pdf' | 'image'

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // "%PDF"

export async function detectFileKind(file: File): Promise<FileKind> {
  const header = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer())
  const isPdf = PDF_MAGIC.every((byte, index) => header[index] === byte)
  return isPdf ? 'pdf' : 'image'
}

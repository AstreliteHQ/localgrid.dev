/** Pure PDF-merging logic behind the Merge PDFs widget — no DOM, no widget
 * state, just files in and merged bytes (or an error) out. */

import { PDFDocument } from 'pdf-lib'

/** Page count for a single PDF, used to show each queued file's own count
 * before anything is merged, and to catch a file that isn't actually a
 * readable PDF as early as possible. */
export async function countPages(file: File): Promise<number> {
  const bytes = await file.arrayBuffer()
  const doc = await PDFDocument.load(bytes)
  return doc.getPageCount()
}

export interface MergeResult {
  bytes: Uint8Array
  pageCount: number
}

/** Concatenates every given file's pages, in the given order, into one new
 * PDF. Throws (with the offending file's name in the message) if any file
 * isn't a readable PDF — the widget is expected to have already validated
 * each file via `countPages` before offering a merge, so this is a last
 * resort rather than the primary error path. */
export async function mergePdfs(files: File[]): Promise<MergeResult> {
  const merged = await PDFDocument.create()
  for (const file of files) {
    let source
    try {
      source = await PDFDocument.load(await file.arrayBuffer())
    } catch {
      throw new Error(`"${file.name}" isn't a readable PDF.`)
    }
    const pages = await merged.copyPages(source, source.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }
  const bytes = await merged.save()
  return { bytes, pageCount: merged.getPageCount() }
}

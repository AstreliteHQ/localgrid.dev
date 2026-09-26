/** Pure PDF-splitting logic behind the Split PDF widget — no DOM, no widget
 * state, just a file (and page ranges) in, separate PDFs out. */

import { PDFDocument } from 'pdf-lib'

/** Page count for the loaded PDF, and the same "is this even a readable
 * PDF" check the widget uses before offering to split it. */
export async function countPages(file: File): Promise<number> {
  const bytes = await file.arrayBuffer()
  const doc = await PDFDocument.load(bytes)
  return doc.getPageCount()
}

/** 1-based, inclusive — matches how someone would actually type a page
 * range, rather than the 0-based indices pdf-lib itself works with. */
export interface PageRange {
  start: number
  end: number
}

export interface ParsedRanges {
  ranges: PageRange[]
  error: string | null
}

const RANGE_TOKEN = /^(\d+)(?:-(\d+))?$/

/** Parses a comma-separated list like `"1-3, 5, 7-9"` into validated,
 * 1-based page ranges — one output PDF per range. Every page number has to
 * fall within `pageCount`, and a range's start can't come after its end. */
export function parsePageRanges(input: string, pageCount: number): ParsedRanges {
  const trimmed = input.trim()
  if (!trimmed) return { ranges: [], error: 'Enter at least one page or range, e.g. "1-3, 5".' }

  const ranges: PageRange[] = []
  for (const rawToken of trimmed.split(',')) {
    const token = rawToken.trim()
    if (!token) continue
    // Spaces around the dash ("1 - 2") read naturally when typing a range
    // by hand — only stripped for matching, so the error message below
    // still echoes the token as typed.
    const match = RANGE_TOKEN.exec(token.replace(/\s+/g, ''))
    if (!match) return { ranges: [], error: `"${token}" isn't a page number or range.` }
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : start
    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      return { ranges: [], error: `"${token}" is outside this PDF's ${pageCount} page${pageCount === 1 ? '' : 's'}.` }
    }
    if (start > end) return { ranges: [], error: `"${token}" starts after it ends.` }
    ranges.push({ start, end })
  }
  if (ranges.length === 0) return { ranges: [], error: 'Enter at least one page or range, e.g. "1-3, 5".' }
  return { ranges, error: null }
}

/** One range for every single page, in order — the "split into every
 * page" mode's ranges, without a user having to type `"1, 2, 3, ..."`. */
export function everyPageRanges(pageCount: number): PageRange[] {
  return Array.from({ length: pageCount }, (_, index) => ({ start: index + 1, end: index + 1 }))
}

export interface SplitPart {
  label: string
  range: PageRange
  bytes: Uint8Array
  pageCount: number
}

function labelFor(range: PageRange): string {
  return range.start === range.end ? `page-${range.start}` : `pages-${range.start}-${range.end}`
}

/** Extracts each given range into its own standalone PDF. Ranges may
 * overlap or repeat a page — nothing here assumes they partition the
 * document. */
export async function splitPdf(file: File, ranges: PageRange[]): Promise<SplitPart[]> {
  const bytes = await file.arrayBuffer()
  const source = await PDFDocument.load(bytes)
  const parts: SplitPart[] = []
  for (const range of ranges) {
    const doc = await PDFDocument.create()
    const indices: number[] = []
    for (let page = range.start; page <= range.end; page++) indices.push(page - 1)
    const pages = await doc.copyPages(source, indices)
    for (const page of pages) doc.addPage(page)
    const partBytes = await doc.save()
    parts.push({ label: labelFor(range), range, bytes: partBytes, pageCount: indices.length })
  }
  return parts
}

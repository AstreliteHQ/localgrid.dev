import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { countPages, everyPageRanges, parsePageRanges, splitPdf } from './splitPdf'

async function makePdf(pageCount: number): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([100, 100])
  const bytes = await doc.save()
  return new File([new Uint8Array(bytes)], 'source.pdf', { type: 'application/pdf' })
}

describe('countPages', () => {
  it("reports a PDF file's own page count", async () => {
    expect(await countPages(await makePdf(6))).toBe(6)
  })

  it('rejects a file that is not a real PDF', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'broken.pdf', { type: 'application/pdf' })
    await expect(countPages(file)).rejects.toThrow()
  })
})

describe('parsePageRanges', () => {
  it('parses a mix of single pages and ranges', () => {
    expect(parsePageRanges('1-3, 5, 7-9', 9)).toEqual({
      ranges: [
        { start: 1, end: 3 },
        { start: 5, end: 5 },
        { start: 7, end: 9 },
      ],
      error: null,
    })
  })

  it('tolerates extra whitespace and a trailing comma', () => {
    expect(parsePageRanges(' 1 - 2 ,  4, ', 4)).toEqual({
      ranges: [
        { start: 1, end: 2 },
        { start: 4, end: 4 },
      ],
      error: null,
    })
  })

  it('rejects blank input', () => {
    expect(parsePageRanges('', 5).error).toMatch(/enter at least one/i)
    expect(parsePageRanges('   ', 5).error).toMatch(/enter at least one/i)
  })

  it('rejects a token that is not a page number or range', () => {
    expect(parsePageRanges('1, two, 3', 5).error).toMatch(/"two" isn't a page number/i)
  })

  it('rejects a page number outside the document', () => {
    expect(parsePageRanges('1-3', 2).error).toMatch(/outside this pdf's 2 pages/i)
    expect(parsePageRanges('0-1', 5).error).toMatch(/outside/i)
  })

  it('rejects a range that starts after it ends', () => {
    expect(parsePageRanges('5-2', 5).error).toMatch(/starts after it ends/i)
  })
})

describe('everyPageRanges', () => {
  it('produces one single-page range per page, in order', () => {
    expect(everyPageRanges(3)).toEqual([
      { start: 1, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 3 },
    ])
  })

  it('is empty for a zero-page document', () => {
    expect(everyPageRanges(0)).toEqual([])
  })
})

describe('splitPdf', () => {
  it('extracts each range into its own PDF with the right page count', async () => {
    const file = await makePdf(9)
    const parts = await splitPdf(file, [
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 7, end: 9 },
    ])

    expect(parts.map((part) => part.pageCount)).toEqual([3, 1, 3])
    for (const part of parts) {
      const doc = await PDFDocument.load(part.bytes)
      expect(doc.getPageCount()).toBe(part.pageCount)
    }
  })

  it('labels a single page differently from a multi-page range', async () => {
    const file = await makePdf(5)
    const parts = await splitPdf(file, [
      { start: 2, end: 2 },
      { start: 3, end: 5 },
    ])

    expect(parts[0].label).toBe('page-2')
    expect(parts[1].label).toBe('pages-3-5')
  })

  it('splits into one PDF per page when given every-page ranges', async () => {
    const file = await makePdf(4)
    const parts = await splitPdf(file, everyPageRanges(4))

    expect(parts).toHaveLength(4)
    expect(parts.every((part) => part.pageCount === 1)).toBe(true)
  })

  it('allows overlapping ranges, since each output is independent', async () => {
    const file = await makePdf(5)
    const parts = await splitPdf(file, [
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ])

    expect(parts.map((part) => part.pageCount)).toEqual([2, 2])
  })
})

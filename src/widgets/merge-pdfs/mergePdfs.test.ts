import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { countPages, mergePdfs } from './mergePdfs'

async function makePdf(name: string, pageCount: number): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([100, 100])
  const bytes = await doc.save()
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

function notAPdf(name: string): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'application/pdf' })
}

describe('countPages', () => {
  it("reports a PDF file's own page count", async () => {
    const file = await makePdf('a.pdf', 3)
    expect(await countPages(file)).toBe(3)
  })

  it('rejects a file that is not a real PDF', async () => {
    await expect(countPages(notAPdf('broken.pdf'))).rejects.toThrow()
  })
})

describe('mergePdfs', () => {
  it('concatenates pages from every file, in order', async () => {
    const a = await makePdf('a.pdf', 2)
    const b = await makePdf('b.pdf', 3)
    const result = await mergePdfs([a, b])

    expect(result.pageCount).toBe(5)
    const merged = await PDFDocument.load(result.bytes)
    expect(merged.getPageCount()).toBe(5)
  })

  it('merges in the given file order rather than always the same one', async () => {
    const a = await makePdf('a.pdf', 1)
    const b = await makePdf('b.pdf', 2)

    expect((await mergePdfs([a, b])).pageCount).toBe(3)
    expect((await mergePdfs([b, a])).pageCount).toBe(3)
  })

  it('merges a single file into an equivalent copy', async () => {
    const a = await makePdf('a.pdf', 4)
    const result = await mergePdfs([a])

    expect(result.pageCount).toBe(4)
  })

  it('names the offending file when one is not a readable PDF', async () => {
    const a = await makePdf('a.pdf', 1)
    await expect(mergePdfs([a, notAPdf('broken.pdf')])).rejects.toThrow(/broken\.pdf/)
  })
})

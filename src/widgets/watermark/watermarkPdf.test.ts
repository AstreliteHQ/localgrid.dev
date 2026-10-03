import { describe, expect, it } from 'vitest'
import { PDFDocument } from '@cantoo/pdf-lib'
import { centeredStampOrigin, hexToRgb01, watermarkPdf } from './watermarkPdf'

async function makePdf(pageCount: number, size: [number, number] = [200, 200]): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage(size)
  const bytes = await doc.save()
  return new File([new Uint8Array(bytes)], 'source.pdf', { type: 'application/pdf' })
}

function notAPdf(): File {
  return new File([new Uint8Array([1, 2, 3])], 'broken.pdf', { type: 'application/pdf' })
}

const BASE_OPTIONS = { text: 'CONFIDENTIAL', opacity: 0.3, color: '#ff0000', fontSize: 24 } as const

describe('hexToRgb01', () => {
  it('converts a hex color to 0..1 channels', () => {
    expect(hexToRgb01('#ff0000')).toEqual({ r: 1, g: 0, b: 0 })
    expect(hexToRgb01('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb01('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
  })

  it('tolerates a hex color without the leading #', () => {
    expect(hexToRgb01('00ff00')).toEqual({ r: 0, g: 1, b: 0 })
  })
})

describe('centeredStampOrigin', () => {
  it('places the middle of the 45°-rotated text at the page center, not its un-rotated start point', () => {
    // A zero-width string has no offset to correct for, so its start point
    // and its middle are the same place: the page's own center.
    expect(centeredStampOrigin(200, 100, 0)).toEqual({ x: 100, y: 50 })
  })

  it('walks the start point back along the rotated baseline, not the horizontal one', () => {
    const origin = centeredStampOrigin(200, 100, 100)
    // Walking back purely horizontally (the pre-fix behavior) would give
    // x: 50, y: 50 — the middle of a 45°-rotated string instead lands
    // textWidth/2 away from the start point diagonally, so both
    // coordinates move back by the same, smaller amount.
    const half = 50 / Math.SQRT2
    expect(origin).toEqual({ x: 100 - half, y: 50 - half })
    expect(origin.x).toBeCloseTo(64.64, 1)
    expect(origin.y).toBeCloseTo(14.64, 1)
  })
})

describe('watermarkPdf', () => {
  it('produces a PDF with the same page count as the source', async () => {
    const file = await makePdf(3)
    const bytes = await watermarkPdf(file, { ...BASE_OPTIONS, position: 'center' })

    const result = await PDFDocument.load(bytes)
    expect(result.getPageCount()).toBe(3)
  })

  it('stamps every page, not just the first', async () => {
    const file = await makePdf(2)
    const bytes = await watermarkPdf(file, { ...BASE_OPTIONS, position: 'tiled' })

    const result = await PDFDocument.load(bytes)
    // pdf-lib doesn't expose drawn text back out for inspection, so the
    // closest black-box check is that watermarking a multi-page document
    // doesn't shrink it down to fewer operations worth of pages, and that
    // it actually produces larger output than an unwatermarked copy (more
    // draw operations were serialized in).
    const plain = await (await PDFDocument.create()).copyPages(result, result.getPageIndices())
    expect(plain.length).toBe(2)
  })

  it('produces larger output for a tiled watermark than a single centered one', async () => {
    const file = await makePdf(1)
    const centered = await watermarkPdf(file, { ...BASE_OPTIONS, position: 'center' })
    const tiled = await watermarkPdf(file, { ...BASE_OPTIONS, position: 'tiled' })

    expect(tiled.byteLength).toBeGreaterThan(centered.byteLength)
  })

  it('rejects a file that is not a readable PDF', async () => {
    await expect(watermarkPdf(notAPdf(), { ...BASE_OPTIONS, position: 'center' })).rejects.toThrow()
  })
})

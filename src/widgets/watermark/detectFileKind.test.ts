import { describe, expect, it } from 'vitest'
import { detectFileKind } from './detectFileKind'

describe('detectFileKind', () => {
  it('recognizes a PDF from its magic bytes', async () => {
    const file = new File([new TextEncoder().encode('%PDF-1.4\n...')], 'doc.pdf', { type: 'application/pdf' })
    expect(await detectFileKind(file)).toBe('pdf')
  })

  it('treats anything without the PDF magic bytes as an image', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'photo.png', { type: 'image/png' })
    expect(await detectFileKind(png)).toBe('image')
  })

  it('does not trust a misleading file extension or MIME type', async () => {
    // Named and typed like a PDF, but its bytes say otherwise.
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'mislabelled.pdf', { type: 'application/pdf' })
    expect(await detectFileKind(file)).toBe('image')
  })

  it('handles a file shorter than the magic bytes without throwing', async () => {
    const file = new File([new Uint8Array([0x25])], 'tiny')
    expect(await detectFileKind(file)).toBe('image')
  })
})

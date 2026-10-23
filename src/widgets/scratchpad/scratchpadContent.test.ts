import { describe, expect, it } from 'vitest'
import { buildHtmlDocument, dataUrlToBlob, deriveTitle, pickImageFiles, readAsDataUrl } from './scratchpadContent'

function transfer(files: File[], data: Record<string, string> = {}) {
  return { files, getData: (type: string) => data[type] ?? '' }
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

describe('pickImageFiles', () => {
  it('returns nothing for a missing transfer', () => {
    expect(pickImageFiles(null)).toEqual([])
  })

  it('takes a bare screenshot', () => {
    const file = png()
    expect(pickImageFiles(transfer([file]))).toEqual([file])
  })

  it('prefers the file over an <img> in text/html, as a browser "Copy image" sends both', () => {
    const file = png()
    expect(pickImageFiles(transfer([file], { 'text/html': '<img src="https://example.com/a.png">' }))).toEqual([file])
  })

  it('leaves a text paste alone even when an app attaches a picture of it', () => {
    expect(pickImageFiles(transfer([png()], { 'text/plain': 'Quarterly numbers' }))).toEqual([])
  })

  it('ignores non-image files', () => {
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    expect(pickImageFiles(transfer([pdf]))).toEqual([])
  })
})

describe('dataUrlToBlob', () => {
  it('decodes base64 payloads with their type', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw==')
    expect(blob.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([137, 80, 78, 71])
  })

  it('decodes percent-encoded payloads', async () => {
    const blob = dataUrlToBlob('data:text/plain,hello%20world')
    expect(await blob.text()).toBe('hello world')
  })

  it('rejects anything that is not a data URL', () => {
    expect(() => dataUrlToBlob('https://example.com/a.png')).toThrow()
  })
})

describe('readAsDataUrl', () => {
  it('round-trips a file through a data URL', async () => {
    const url = await readAsDataUrl(png())
    expect(url).toBe('data:image/png;base64,iVBORw==')
  })
})

describe('buildHtmlDocument', () => {
  it('wraps the body in a standalone UTF-8 document with an escaped title', () => {
    const html = buildHtmlDocument('<p>Hi</p>', 'Bug <42>')
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>Bug &lt;42&gt;</title>')
    expect(html).toContain('<body>\n<p>Hi</p>\n</body>')
  })
})

describe('deriveTitle', () => {
  it('uses the first non-blank line', () => {
    expect(deriveTitle('\n\n  Login fails on Safari \n\nsteps')).toBe('Login fails on Safari')
  })

  it('falls back when the note has no text', () => {
    expect(deriveTitle('')).toBe('Scratchpad')
  })

  it('shortens long lines', () => {
    expect(deriveTitle('x'.repeat(200))).toHaveLength(80)
  })
})

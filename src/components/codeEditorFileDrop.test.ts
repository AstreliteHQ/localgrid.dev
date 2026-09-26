import { describe, expect, it } from 'vitest'
import { isFileDrag, looksBinary, readDroppedFile } from './codeEditorFileDrop'

describe('looksBinary', () => {
  it('accepts ordinary text, including tabs and newlines', () => {
    expect(looksBinary('{\n\t"a": 1\r\n}')).toBe(false)
  })

  it('flags consecutive control characters', () => {
    expect(looksBinary('\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR')).toBe(true)
  })
})

describe('isFileDrag', () => {
  it('is true only when the drag carries files', () => {
    expect(isFileDrag({ types: ['Files'] } as unknown as DataTransfer)).toBe(true)
    expect(isFileDrag({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false)
    expect(isFileDrag(null)).toBe(false)
  })
})

describe('readDroppedFile', () => {
  it('returns the text of the first file', async () => {
    const files = [new File(['first'], 'a.txt'), new File(['second'], 'b.txt')]
    expect(await readDroppedFile(files)).toEqual({ ok: true, text: 'first' })
  })

  it('rejects binary content', async () => {
    const result = await readDroppedFile([new File([new Uint8Array([0, 1, 2, 3])], 'image.png')])
    expect(result).toEqual({ ok: false, error: 'image.png is not a plain text file.' })
  })

  it('reports an empty drop', async () => {
    expect(await readDroppedFile([])).toEqual({ ok: false, error: 'No file dropped.' })
  })
})

import { describe, expect, it } from 'vitest'
import { imageLabel, pickImageFiles } from './bufferImages'

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array(8)], name, { type })
}

function idFactory(): () => string {
  let n = 0
  return () => `id-${++n}`
}

describe('pickImageFiles', () => {
  it('accepts image files and assigns an id from the factory', () => {
    const file = makeFile('a.png', 'image/png')
    const result = pickImageFiles([file], idFactory())
    expect(result.images).toEqual([{ id: 'id-1', file }])
    expect(result.errors).toEqual([])
  })

  it('rejects a non-image file with a named error', () => {
    const result = pickImageFiles([makeFile('notes.txt', 'text/plain')], idFactory())
    expect(result.images).toEqual([])
    expect(result.errors).toEqual(['notes.txt is not an image.'])
  })

  it('keeps the accepted files of a mixed batch and collects every rejection', () => {
    const result = pickImageFiles(
      [makeFile('a.png', 'image/png'), makeFile('b.txt', 'text/plain'), makeFile('c.jpg', 'image/jpeg')],
      idFactory(),
    )
    expect(result.images.map((image) => image.file.name)).toEqual(['a.png', 'c.jpg'])
    expect(result.errors).toEqual(['b.txt is not an image.'])
  })

  it('returns empty results for an empty file list', () => {
    expect(pickImageFiles([], idFactory())).toEqual({ images: [], errors: [] })
  })
})

describe('imageLabel', () => {
  it('uses the file name when there is one', () => {
    expect(imageLabel(makeFile('shot.png', 'image/png'))).toBe('shot.png')
  })

  it('falls back to a generic label for an unnamed file', () => {
    expect(imageLabel(makeFile('', 'image/png'))).toBe('Pasted image')
  })
})

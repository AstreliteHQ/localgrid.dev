import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, pickImageFiles } from './noteImages'

function makeFile(name: string, type: string, size = 100): File {
  const file = new File([new Uint8Array(size)], name, { type })
  return file
}

function idFactory(): () => string {
  let n = 0
  return () => `id-${++n}`
}

describe('pickImageFiles', () => {
  it('accepts image files and assigns an id from the factory', () => {
    const result = pickImageFiles([makeFile('a.png', 'image/png')], idFactory())
    expect(result.images).toEqual([{ id: 'id-1', file: result.images[0].file }])
    expect(result.images[0].file.name).toBe('a.png')
    expect(result.errors).toEqual([])
  })

  it('rejects a non-image file with a named error', () => {
    const result = pickImageFiles([makeFile('notes.txt', 'text/plain')], idFactory())
    expect(result.images).toEqual([])
    expect(result.errors).toEqual(['notes.txt is not an image.'])
  })

  it('rejects a file over the size cap with a named error', () => {
    const result = pickImageFiles([makeFile('huge.png', 'image/png', MAX_IMAGE_BYTES + 1)], idFactory())
    expect(result.images).toEqual([])
    expect(result.errors).toEqual(['huge.png is larger than 8MB.'])
  })

  it('accepts a file exactly at the size cap', () => {
    const result = pickImageFiles([makeFile('ok.png', 'image/png', MAX_IMAGE_BYTES)], idFactory())
    expect(result.images).toHaveLength(1)
    expect(result.errors).toEqual([])
  })

  it('processes a mixed batch, keeping accepted files and collecting every rejection', () => {
    const result = pickImageFiles(
      [makeFile('a.png', 'image/png'), makeFile('b.txt', 'text/plain'), makeFile('c.jpg', 'image/jpeg')],
      idFactory(),
    )
    expect(result.images.map((image) => image.file.name)).toEqual(['a.png', 'c.jpg'])
    expect(result.errors).toEqual(['b.txt is not an image.'])
  })

  it('returns empty results for an empty file list', () => {
    const result = pickImageFiles([], idFactory())
    expect(result.images).toEqual([])
    expect(result.errors).toEqual([])
  })
})

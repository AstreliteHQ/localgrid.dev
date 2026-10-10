import { describe, expect, it } from 'vitest'
import { lineForPointer, parseDocumentIndex } from './documentLineForPointer'

const JSON_DOC = `{
  "id": "x",
  "items": [
    { "price": -5 },
    { "price": 10 }
  ]
}`

const YAML_DOC = `id: x
items:
  - price: -5
  - price: 10
`

function line(documentText: string, pointer: string): number | null {
  const index = parseDocumentIndex(documentText)
  return index && lineForPointer(index, pointer)
}

describe('parseDocumentIndex / lineForPointer', () => {
  it('finds a top-level key in a JSON document', () => {
    expect(line(JSON_DOC, '/id')).toBe(2)
  })

  it('finds a value nested inside an array in a JSON document', () => {
    expect(line(JSON_DOC, '/items/0/price')).toBe(4)
    expect(line(JSON_DOC, '/items/1/price')).toBe(5)
  })

  it('finds the same paths in an equivalent YAML document', () => {
    expect(line(YAML_DOC, '/id')).toBe(1)
    expect(line(YAML_DOC, '/items/0/price')).toBe(3)
    expect(line(YAML_DOC, '/items/1/price')).toBe(4)
  })

  it('points a root-level pointer (used for e.g. a missing required property) at the first line', () => {
    expect(line(JSON_DOC, '')).toBe(1)
    expect(line(JSON_DOC, '/')).toBe(1)
  })

  it('unescapes ~1 and ~0 in a pointer segment', () => {
    const doc = `{ "a/b": 1, "c~d": 2 }`
    expect(line(doc, '/a~1b')).toBe(1)
    expect(line(doc, '/c~0d')).toBe(1)
  })

  it('is null for a pointer that does not resolve to anything in the document', () => {
    expect(line(JSON_DOC, '/items/5/price')).toBeNull()
    expect(line(JSON_DOC, '/nope')).toBeNull()
  })

  it('is null when the document itself does not parse', () => {
    expect(parseDocumentIndex('{ not valid')).toBeNull()
  })

  it('resolves every pointer against the same parsed index, each at its own line', () => {
    const index = parseDocumentIndex(JSON_DOC)
    expect(index).not.toBeNull()
    if (!index) return
    expect(lineForPointer(index, '/id')).toBe(2)
    expect(lineForPointer(index, '/items/0/price')).toBe(4)
    expect(lineForPointer(index, '/items/1/price')).toBe(5)
  })
})

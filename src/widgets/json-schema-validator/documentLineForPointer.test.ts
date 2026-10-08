import { describe, expect, it } from 'vitest'
import { documentLineForPointer } from './documentLineForPointer'

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

describe('documentLineForPointer', () => {
  it('finds a top-level key in a JSON document', () => {
    expect(documentLineForPointer(JSON_DOC, '/id')).toBe(2)
  })

  it('finds a value nested inside an array in a JSON document', () => {
    expect(documentLineForPointer(JSON_DOC, '/items/0/price')).toBe(4)
    expect(documentLineForPointer(JSON_DOC, '/items/1/price')).toBe(5)
  })

  it('finds the same paths in an equivalent YAML document', () => {
    expect(documentLineForPointer(YAML_DOC, '/id')).toBe(1)
    expect(documentLineForPointer(YAML_DOC, '/items/0/price')).toBe(3)
    expect(documentLineForPointer(YAML_DOC, '/items/1/price')).toBe(4)
  })

  it('points a root-level pointer (used for e.g. a missing required property) at the first line', () => {
    expect(documentLineForPointer(JSON_DOC, '')).toBe(1)
    expect(documentLineForPointer(JSON_DOC, '/')).toBe(1)
  })

  it('unescapes ~1 and ~0 in a pointer segment', () => {
    const doc = `{ "a/b": 1, "c~d": 2 }`
    expect(documentLineForPointer(doc, '/a~1b')).toBe(1)
    expect(documentLineForPointer(doc, '/c~0d')).toBe(1)
  })

  it('is null for a pointer that does not resolve to anything in the document', () => {
    expect(documentLineForPointer(JSON_DOC, '/items/5/price')).toBeNull()
    expect(documentLineForPointer(JSON_DOC, '/nope')).toBeNull()
  })

  it('is null when the document itself does not parse', () => {
    expect(documentLineForPointer('{ not valid', '/id')).toBeNull()
  })
})

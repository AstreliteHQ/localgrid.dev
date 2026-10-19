import { describe, expect, it } from 'vitest'
import { parseDocument } from './parseDocument'

describe('parseDocument', () => {
  it('treats blank input as nothing to compare, without an error', () => {
    expect(parseDocument('  \n', 'json')).toEqual({ ok: false, error: null })
    expect(parseDocument('', 'yaml')).toEqual({ ok: false, error: null })
  })

  it('parses JSON', () => {
    expect(parseDocument('{"a": [1, 2]}', 'json')).toEqual({ ok: true, value: { a: [1, 2] } })
  })

  it('reports invalid JSON', () => {
    const result = parseDocument('{"a": }', 'json')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBeTruthy()
  })

  it('parses YAML, and JSON in YAML mode', () => {
    expect(parseDocument('a:\n  - 1\n  - 2', 'yaml')).toEqual({ ok: true, value: { a: [1, 2] } })
    expect(parseDocument('{"a": [1, 2]}', 'yaml')).toEqual({ ok: true, value: { a: [1, 2] } })
  })

  it('turns a multi-document YAML stream into a list of documents', () => {
    expect(parseDocument('kind: A\n---\nkind: B', 'yaml')).toEqual({
      ok: true,
      value: [{ kind: 'A' }, { kind: 'B' }],
    })
  })

  it('reads a comment-only YAML stream as null', () => {
    expect(parseDocument('# nothing here', 'yaml')).toEqual({ ok: true, value: null })
  })

  it('reports invalid YAML', () => {
    const result = parseDocument('a: [1, 2', 'yaml')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBeTruthy()
  })

  it('rejects an alias that refers to its own parent', () => {
    const result = parseDocument('a: &self\n  b: *self', 'yaml')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/alias/)
  })

  it('accepts the same anchor reused in two places', () => {
    expect(parseDocument('base: &b { x: 1 }\none: *b\ntwo: *b', 'yaml')).toEqual({
      ok: true,
      value: { base: { x: 1 }, one: { x: 1 }, two: { x: 1 } },
    })
  })
})

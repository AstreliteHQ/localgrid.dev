import { describe, expect, it } from 'vitest'
import { carryInputAcross, findNull, formatToml, jsonToToml, parseTomlDocument, tomlToJson } from './tomlConvert'

describe('parseTomlDocument', () => {
  it('parses tables, arrays of tables and dates into plain JSON data', () => {
    const { data, error } = parseTomlDocument(
      'title = "x"\nwhen = 1979-05-27T07:32:00Z\n[owner]\nname = "a"\n[[items]]\nid = 1\n[[items]]\nid = 2\n',
    )
    expect(error).toBeNull()
    expect(data).toEqual({
      title: 'x',
      when: '1979-05-27T07:32:00.000Z',
      owner: { name: 'a' },
      items: [{ id: 1 }, { id: 2 }],
    })
  })

  it('reports a located error for invalid TOML', () => {
    const { data, error } = parseTomlDocument('a = 1\nb = [\nc')
    expect(data).toBeUndefined()
    expect(error).toMatch(/invalid toml/i)
    expect(error).toContain('3:  c')
  })

  it('returns nothing for blank input', () => {
    expect(parseTomlDocument('  \n')).toEqual({ data: undefined, raw: undefined, error: null })
  })
})

describe('tomlToJson', () => {
  it('pretty prints the parsed document as JSON', () => {
    expect(tomlToJson('a = 1\n[b]\nc = "d"')).toEqual({
      output: '{\n  "a": 1,\n  "b": {\n    "c": "d"\n  }\n}',
      error: null,
    })
  })
})

describe('formatToml', () => {
  it('normalizes layout and keeps dates as TOML dates', () => {
    const { output, error } = formatToml('b.c   =   "d"\na=1\nwhen = 1979-05-27')
    expect(error).toBeNull()
    expect(output).toContain('a = 1')
    expect(output).toContain('when = 1979-05-27')
    expect(output).toContain('[b]\nc = "d"')
  })
})

describe('jsonToToml', () => {
  it('converts a JSON object to TOML', () => {
    expect(jsonToToml('{"name":"x","build":{"minify":true}}')).toEqual({
      output: 'name = "x"\n\n[build]\nminify = true\n',
      error: null,
    })
  })

  it('rejects a top-level array or scalar', () => {
    expect(jsonToToml('[1, 2]').error).toMatch(/object at the top level/)
    expect(jsonToToml('42').error).toMatch(/object at the top level/)
  })

  it('names the path of a null instead of dropping it', () => {
    expect(jsonToToml('{"a":{"b":[1,null]}}').error).toBe('TOML has no null value (found at $.a.b[1])')
  })

  it('reports invalid JSON', () => {
    expect(jsonToToml('{nope').error).not.toBeNull()
  })
})

describe('findNull', () => {
  it('quotes keys that are not plain identifiers', () => {
    expect(findNull({ 'a b': null })).toBe('$["a b"]')
    expect(findNull({ a: 1 })).toBeNull()
  })
})

describe('carryInputAcross', () => {
  it('converts the input when the input format changes', () => {
    expect(carryInputAcross('a = 1', 'tree', 'from-json')).toBe('{\n  "a": 1\n}')
    expect(carryInputAcross('{"a":1}', 'from-json', 'json')).toBe('a = 1\n')
  })

  it('leaves the input alone when the format stays the same or it does not convert', () => {
    expect(carryInputAcross('a = 1', 'tree', 'json')).toBe('a = 1')
    expect(carryInputAcross('a = [', 'json', 'from-json')).toBe('a = [')
  })
})

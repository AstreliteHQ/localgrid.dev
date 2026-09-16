import { describe, expect, it } from 'vitest'
import protobuf from 'protobufjs'
import { compareWithSchema, decodeWithSchema, MAX_SCHEMA_LENGTH, parseSchema } from './protoSchema'
import { decodeWireFormat, type WireField } from './wireFormat'

const SCHEMA = `syntax = "proto3";
package demo;

message Person {
  int32 id = 1;
  string name = 2;
  repeated string tags = 3;
  Address home = 4;
  Status status = 5;

  enum Status { UNKNOWN = 0; ACTIVE = 1; }
  message Address { string city = 1; }
}

message Team { repeated Person members = 1; }`

function parsed() {
  const result = parseSchema(SCHEMA)
  if (!result.ok) throw new Error(result.reason)
  return result
}

function encodePerson(value: Record<string, unknown>): Uint8Array {
  const Person = parsed().root.lookupType('demo.Person')
  return new Uint8Array(Person.encode(Person.create(value)).finish())
}

function wireFieldsOf(bytes: Uint8Array): WireField[] {
  const result = decodeWireFormat(bytes)
  return result.fields
}

describe('parseSchema', () => {
  it('lists every message type, nested ones included, fully qualified', () => {
    expect(parsed().names).toEqual(['demo.Person', 'demo.Person.Address', 'demo.Team'])
  })

  it('reports a syntax error with the line it objected to', () => {
    const result = parseSchema('syntax = "proto3";\nmessage Broken { int32 id = ; }')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/illegal|token/i)
      expect(result.line).toBe(2)
    }
  })

  it('asks for a definition rather than failing silently on empty input', () => {
    const result = parseSchema('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Paste a .proto definition')
  })

  it('says so when a definition declares no messages', () => {
    const result = parseSchema('syntax = "proto3"; enum Color { RED = 0; }')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('No message types')
  })

  it('explains that an unresolvable import cannot be fetched in the browser', () => {
    const result = parseSchema('syntax = "proto3";\nimport "other/thing.proto";\nmessage A { Thing t = 1; }')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('cannot be resolved in the browser')
  })

  it('refuses a definition past the size limit', () => {
    const result = parseSchema('// pad\n'.repeat(MAX_SCHEMA_LENGTH))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('the limit is 50,000')
  })
})

describe('decodeWithSchema', () => {
  it('names the fields the wire format only numbers', () => {
    const bytes = encodePerson({ id: 150, name: 'testing', tags: ['a'], home: { city: 'Paris' }, status: 1 })
    const result = decodeWithSchema(parsed().root, 'demo.Person', bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      id: 150,
      name: 'testing',
      tags: ['a'],
      home: { city: 'Paris' },
      // Enums come back as their name, not their number.
      status: 'ACTIVE',
    })
  })

  it('keeps the field names the .proto used, not camelCased ones', () => {
    const root = protobuf.parse('syntax = "proto3"; message U { int32 user_id = 1; }', { keepCase: true }).root
    const U = root.lookupType('U')
    const bytes = new Uint8Array(U.encode(U.create({ user_id: 7 })).finish())
    const result = decodeWithSchema(root, 'U', bytes)
    if (!result.ok) throw new Error(result.reason)
    expect(Object.keys(result.value)).toEqual(['user_id'])
  })

  it('reports a message name the definition does not have', () => {
    const result = decodeWithSchema(parsed().root, 'demo.Ghost', new Uint8Array([0x08, 0x01]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('No message type named demo.Ghost')
  })

  it('says the payload may be the wrong message when the decode breaks', () => {
    // A length prefix promising more bytes than the payload has.
    const result = decodeWithSchema(parsed().root, 'demo.Person', new Uint8Array([0x12, 0x40, 0x01]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('may not be a demo.Person')
  })

  it('counts fields the payload carries that the definition never declared', () => {
    // Field 1 (declared) plus field 9 (not in Person).
    const bytes = new Uint8Array([0x08, 0x96, 0x01, 0x48, 0x2a])
    const result = decodeWithSchema(parsed().root, 'demo.Person', bytes, wireFieldsOf(bytes))
    if (!result.ok) throw new Error(result.reason)
    expect(result.value).toEqual({ id: 150 })
    // protobufjs drops field 9 silently; the widget must not.
    expect(result.comparison.unknownFieldNumbers).toEqual([9])
  })

  it('finds nothing to report when the payload matches the definition', () => {
    const bytes = encodePerson({ id: 1, name: 'x', tags: ['a'], home: { city: 'Lyon' }, status: 1 })
    expect(compareWithSchema(parsed().root, 'demo.Person', wireFieldsOf(bytes))).toEqual({
      unknownFieldNumbers: [],
      mismatches: [],
    })
  })

  it('catches a declared field that arrived as the wrong wire type', () => {
    // Person's payload read as an Address: field 1 is an int32 here and a
    // string there, so protobufjs skips it and returns an empty object.
    const bytes = encodePerson({ id: 150, name: 'testing' })
    const comparison = compareWithSchema(parsed().root, 'demo.Person.Address', wireFieldsOf(bytes))
    expect(comparison.mismatches).toEqual([{ fieldNumber: 1, declared: 'string city', wireType: 0 }])
    expect(comparison.unknownFieldNumbers).toEqual([2])

    const decoded = decodeWithSchema(parsed().root, 'demo.Person.Address', bytes, wireFieldsOf(bytes))
    if (!decoded.ok) throw new Error(decoded.reason)
    expect(decoded.value).toEqual({})
  })

  it('accepts a repeated scalar whether it arrives packed or one tag per item', () => {
    const root = protobuf.parse('syntax = "proto3"; message C { repeated int32 v = 1; }', { keepCase: true }).root
    const C = root.lookupType('C')
    const packed = new Uint8Array(C.encode(C.create({ v: [1, 2, 3] })).finish())
    expect(compareWithSchema(root, 'C', wireFieldsOf(packed)).mismatches).toEqual([])
    // The unpacked spelling of the same values: one varint-tagged field each.
    const unpacked = new Uint8Array([0x08, 0x01, 0x08, 0x02, 0x08, 0x03])
    expect(compareWithSchema(root, 'C', wireFieldsOf(unpacked)).mismatches).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import protobuf from 'protobufjs'
import { decodeWireFormat, formatFields, WIRE_TYPE_NAMES, type WireField } from './wireFormat'

function bytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '')
  const out = new Uint8Array(clean.length / 2)
  for (let index = 0; index < out.length; index += 1)
    out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  return out
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function decoded(hex: string): WireField[] {
  const result = decodeWireFormat(bytes(hex))
  if (!result.ok) throw new Error(`${result.reason} at ${result.offset}`)
  return result.fields
}

describe('decodeWireFormat, varints', () => {
  it('reads the canonical example from the protobuf docs', () => {
    // Field 1, varint 150: the encoding every protobuf guide opens with.
    const [field] = decoded('089601')
    expect(field.fieldNumber).toBe(1)
    expect(WIRE_TYPE_NAMES[field.wireType]).toBe('varint')
    expect(field.value).toMatchObject({ kind: 'varint', value: 150n })
  })

  it('offers the signed and zigzag readings of the same bits', () => {
    // -1 as int64 is ten 0xff-ish bytes; as a plain varint it is huge.
    const [field] = decoded('08ffffffffffffffffff01')
    if (field.value.kind !== 'varint') throw new Error('expected a varint')
    expect(field.value.signed).toBe(-1n)
    expect(field.alternatives).toContain('int64 -1')
  })

  it('flags a 0 or 1 varint as possibly a bool', () => {
    const [field] = decoded('0801')
    expect(field.alternatives).toContain('bool true')
  })
})

describe('decodeWireFormat, length-delimited fields', () => {
  it('reads printable content as a string', () => {
    const [field] = decoded('120774657374696e67')
    expect(field.value).toEqual({ kind: 'string', text: 'testing' })
  })

  it('reads a nested message as structure, and keeps the string reading beside it', () => {
    // Field 3 holding { 1: 42 }.
    const [field] = decoded('1a02082a')
    if (field.value.kind !== 'message') throw new Error('expected a nested message')
    expect(field.value.fields[0]).toMatchObject({ fieldNumber: 1, value: { kind: 'varint', value: 42n } })
  })

  it('falls back to bytes for content that is neither, and offers what it might be', () => {
    const [field] = decoded('1203ff0080')
    expect(field.value.kind).toBe('bytes')
  })

  it('reports an empty length-delimited field as ambiguous rather than guessing', () => {
    const [field] = decoded('1200')
    expect(field.value.kind).toBe('bytes')
    expect(field.alternatives).toEqual(['empty string', 'empty message'])
  })

  it('reads fixed-width fields with both their integer and float meaning', () => {
    // Field 1, fixed32 holding the float 1.0.
    const [fixed32] = decoded('0d0000803f')
    if (fixed32.value.kind !== 'fixed32') throw new Error('expected a fixed32')
    expect(fixed32.value.float).toBe(1)
    expect(fixed32.alternatives).toContain('float 1')

    // Field 1, fixed64 holding the double 1.0.
    const [fixed64] = decoded('09000000000000f03f')
    if (fixed64.value.kind !== 'fixed64') throw new Error('expected a fixed64')
    expect(fixed64.value.double).toBe(1)
  })
})

describe('decodeWireFormat, round trip against protobufjs', () => {
  const root = protobuf.parse(
    `syntax = "proto3";
     message Person {
       int32 id = 1;
       string name = 2;
       repeated string tags = 3;
       Address home = 4;
     }
     message Address { string city = 1; }`,
    { keepCase: true },
  ).root
  const Person = root.lookupType('Person')

  it('recovers the structure of a message it was never given the schema for', () => {
    const payload = Person.encode(
      Person.create({ id: 150, name: 'testing', tags: ['a', 'b'], home: { city: 'Paris' } }),
    ).finish()

    const result = decodeWireFormat(new Uint8Array(payload))
    if (!result.ok) throw new Error(result.reason)

    expect(result.fields.map((field) => field.fieldNumber)).toEqual([1, 2, 3, 3, 4])
    expect(result.fields[0].value).toMatchObject({ kind: 'varint', value: 150n })
    expect(result.fields[1].value).toEqual({ kind: 'string', text: 'testing' })
    expect(result.fields[2].value).toEqual({ kind: 'string', text: 'a' })
    const nested = result.fields[4].value
    if (nested.kind !== 'message') throw new Error('expected the nested Address')
    expect(nested.fields[0].value).toEqual({ kind: 'string', text: 'Paris' })
  })

  it('reads a packed repeated field as bytes, and says it could be packed varints', () => {
    const packedRoot = protobuf.parse('syntax = "proto3"; message Counts { repeated int32 values = 1; }').root
    const Counts = packedRoot.lookupType('Counts')
    const payload = Counts.encode(Counts.create({ values: [300, 400, 500] })).finish()

    const [field] = decoded(hexOf(new Uint8Array(payload)))
    expect(field.alternatives.some((alternative) => alternative.startsWith('packed varints'))).toBe(true)
  })
})

describe('decodeWireFormat, payloads that are not what they claim', () => {
  it('reports a truncated payload and keeps what it already read', () => {
    // A valid field, then a length prefix promising bytes that are not there.
    const result = decodeWireFormat(bytes('0896011209746573'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('past the end')
    expect(result.fields).toHaveLength(1)
    expect(result.offset).toBe(3)
  })

  it('rejects field number 0, which no protobuf writes', () => {
    const result = decodeWireFormat(bytes('0001'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Field number 0')
  })

  it('rejects the wire types protobuf never defined', () => {
    const result = decodeWireFormat(bytes('0e00'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Wire type 6')
  })

  it('does not run away on deeply nested payloads', () => {
    // 24 levels of a message wrapping a message, one past the depth guard.
    let payload = bytes('089601')
    for (let level = 0; level < 30; level += 1) {
      const wrapper = new Uint8Array(payload.length + 2)
      wrapper[0] = 0x0a
      wrapper[1] = payload.length
      wrapper.set(payload, 2)
      payload = wrapper
    }
    const result = decodeWireFormat(payload)
    expect(result.ok).toBe(true)
  })
})

describe('decodeWireFormat, groups', () => {
  // Proto2 groups: 0x0b is field 1 start-group, 0x0c its end-group tag.
  it('keeps decoding after a group closes, and charges it only its own bytes', () => {
    // group 1 { 2: 150 }, then field 3 varint 7.
    const fields = decoded('0b 10 96 01 0c 18 07')
    expect(fields.map((field) => field.fieldNumber)).toEqual([1, 3])

    const group = fields[0]
    expect(group.value).toMatchObject({ kind: 'message' })
    if (group.value.kind !== 'message') throw new Error('expected a group')
    expect(group.value.fields[0]).toMatchObject({ fieldNumber: 2, value: { kind: 'varint', value: 150n } })
    // Tag, body and end-group tag: five bytes, not the rest of the payload.
    expect(group.byteLength).toBe(5)

    expect(fields[1].value).toMatchObject({ kind: 'varint', value: 7n })
  })

  it('reports a group that never closes', () => {
    const result = decodeWireFormat(bytes('0b 10 96 01'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('never closed')
  })

  it('reports an end-group tag that closes a different field', () => {
    // Opens group 1, closes group 2.
    const result = decodeWireFormat(bytes('0b 10 96 01 14'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Mismatched end-group')
  })

  it('stops instead of overflowing the stack on a run of start-group tags', () => {
    // Every 0x0b opens a group and consumes one byte, so without a depth
    // guard the recursion depth equals the payload length.
    const payload = new Uint8Array(5000).fill(0x0b)
    const result = decodeWireFormat(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('too deep')
  })
})

describe('formatFields', () => {
  it('renders nesting as indented blocks', () => {
    expect(formatFields(decoded('0896011a02082a'))).toBe('1 (varint): 150\n3 (length-delimited) {\n  1 (varint): 42\n}')
  })
})

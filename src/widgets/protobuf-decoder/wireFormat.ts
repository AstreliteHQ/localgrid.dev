/** Schema-less protobuf decoder.
 *
 * The wire format keeps field numbers and a 3-bit wire type, and throws the
 * rest away: names, declared types, and the difference between an int32, a
 * bool and an enum all live in the .proto, not in the bytes. So a decode
 * without the schema can always recover the structure, and can only offer
 * readings of each value. Where more than one reading is valid, the extra
 * ones ride along on the field so the widget can show them instead of
 * silently picking one.
 */

export const WIRE_TYPE_NAMES: Record<number, string> = {
  0: 'varint',
  1: '64-bit',
  2: 'length-delimited',
  3: 'start group',
  4: 'end group',
  5: '32-bit',
}

export type WireValue =
  | { kind: 'varint'; value: bigint; signed: bigint; zigzag: bigint }
  | { kind: 'fixed64'; value: bigint; double: number }
  | { kind: 'fixed32'; value: number; float: number }
  | { kind: 'message'; fields: WireField[] }
  | { kind: 'string'; text: string }
  | { kind: 'bytes'; bytes: Uint8Array }

export interface WireField {
  fieldNumber: number
  wireType: number
  /** Byte offset of this field's tag, so a row can be traced back to the
   * payload. */
  offset: number
  byteLength: number
  value: WireValue
  /** Equally valid readings of the same bytes, e.g. a length-delimited
   * field that parses as a nested message but is also printable text. */
  alternatives: string[]
}

export interface WireDecodeSuccess {
  ok: true
  fields: WireField[]
  byteLength: number
}

export interface WireDecodeFailure {
  ok: false
  reason: string
  /** Where the decode gave up, so the widget can say how far it got. */
  offset: number
  /** Fields read before the failure: a truncated payload is still worth
   * showing up to the truncation. */
  fields: WireField[]
}

/** Nesting guard. protobuf's own default limit is 100; a payload pasted
 * into a widget never needs that, and a lower bound keeps a pathological
 * input out of deep recursion. */
const MAX_DEPTH = 24

function readVarint(bytes: Uint8Array, offset: number): { value: bigint; next: number } | null {
  let result = 0n
  let shift = 0n
  let index = offset
  while (index < bytes.length) {
    const byte = bytes[index]
    index += 1
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value: result, next: index }
    shift += 7n
    // A varint is at most 10 bytes; anything longer is not one.
    if (shift > 63n) return null
  }
  return null
}

/** Two's-complement reading of the same 64 bits, which is how a negative
 * int32/int64 travels. */
function asSigned(value: bigint): bigint {
  return BigInt.asIntN(64, value)
}

/** ZigZag is how sint32/sint64 encode negatives compactly, and it gives a
 * different number from the plain reading, so both are offered. */
function asZigZag(value: bigint): bigint {
  return (value >> 1n) ^ -(value & 1n)
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

function readUtf8(bytes: Uint8Array): string | null {
  try {
    return utf8.decode(bytes)
  } catch {
    return null
  }
}

/** Text worth preferring over a nested-message reading: no control
 * characters, no replacement characters, and not empty. */
function isCleanText(text: string): boolean {
  if (text.length === 0) return false
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d
    if (isControl || code === 0x7f || code === 0xfffd) return false
  }
  return true
}

/** A packed repeated field is varints back to back with no tags, so that
 * reading is offered whenever the bytes happen to be exactly that. */
function readPackedVarints(bytes: Uint8Array): bigint[] | null {
  const values: bigint[] = []
  let offset = 0
  while (offset < bytes.length) {
    const varint = readVarint(bytes, offset)
    if (!varint) return null
    values.push(varint.value)
    offset = varint.next
  }
  return values.length > 0 ? values : null
}

export function describeValue(value: WireValue): string {
  switch (value.kind) {
    case 'varint':
      return String(value.value)
    case 'fixed64':
      return String(value.value)
    case 'fixed32':
      return String(value.value)
    case 'string':
      return JSON.stringify(value.text)
    case 'bytes':
      return `${value.bytes.length} bytes`
    case 'message':
      return `${value.fields.length} field${value.fields.length === 1 ? '' : 's'}`
  }
}

interface ParseOutcome {
  fields: WireField[]
  /** Set when parsing stopped early; absent on a clean parse. */
  failure?: { reason: string; offset: number }
}

/** Reads fields from `[from, to)`. Stops at the first byte that cannot be a
 * field, reporting where; callers deciding whether a region *is* a message
 * treat any failure as "no". */
function parseFields(bytes: Uint8Array, from: number, to: number, depth: number): ParseOutcome {
  const fields: WireField[] = []
  let offset = from

  while (offset < to) {
    const start = offset
    const tag = readVarint(bytes, offset)
    if (!tag || tag.next > to) return { fields, failure: { reason: 'Truncated field tag.', offset: start } }

    const fieldNumber = Number(tag.value >> 3n)
    const wireType = Number(tag.value & 7n)
    offset = tag.next

    if (fieldNumber === 0) {
      return { fields, failure: { reason: 'Field number 0 is not valid protobuf.', offset: start } }
    }
    if (wireType === 6 || wireType === 7) {
      return { fields, failure: { reason: `Wire type ${wireType} is not valid protobuf.`, offset: start } }
    }
    if (wireType === 4) {
      // An end-group marker with no group open.
      return { fields, failure: { reason: 'Unexpected end-group marker.', offset: start } }
    }

    if (wireType === 0) {
      const varint = readVarint(bytes, offset)
      if (!varint || varint.next > to) {
        return { fields, failure: { reason: 'Truncated varint.', offset: start } }
      }
      const alternatives: string[] = []
      if (varint.value === 0n || varint.value === 1n) alternatives.push(`bool ${varint.value === 1n}`)
      if (asSigned(varint.value) !== varint.value) alternatives.push(`int64 ${asSigned(varint.value)}`)
      if (asZigZag(varint.value) !== varint.value) alternatives.push(`sint64 ${asZigZag(varint.value)}`)
      fields.push({
        fieldNumber,
        wireType,
        offset: start,
        byteLength: varint.next - start,
        value: { kind: 'varint', value: varint.value, signed: asSigned(varint.value), zigzag: asZigZag(varint.value) },
        alternatives,
      })
      offset = varint.next
      continue
    }

    if (wireType === 1 || wireType === 5) {
      const width = wireType === 1 ? 8 : 4
      if (offset + width > to) {
        return { fields, failure: { reason: `Truncated ${width * 8}-bit value.`, offset: start } }
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, width)
      const value: WireValue =
        wireType === 1
          ? { kind: 'fixed64', value: view.getBigUint64(0, true), double: view.getFloat64(0, true) }
          : { kind: 'fixed32', value: view.getUint32(0, true), float: view.getFloat32(0, true) }
      const alternatives =
        value.kind === 'fixed64'
          ? [`double ${value.double}`, `sfixed64 ${BigInt.asIntN(64, value.value)}`]
          : [`float ${value.float}`, `sfixed32 ${value.value | 0}`]
      fields.push({ fieldNumber, wireType, offset: start, byteLength: offset + width - start, value, alternatives })
      offset += width
      continue
    }

    if (wireType === 3) {
      // Groups are a proto2 relic, but they still turn up in old payloads:
      // everything up to the matching end-group tag belongs to this field.
      const inner = parseFields(bytes, offset, to, depth + 1)
      const closed = inner.failure?.reason === 'Unexpected end-group marker.'
      return {
        fields: [
          ...fields,
          {
            fieldNumber,
            wireType,
            offset: start,
            byteLength: to - start,
            value: { kind: 'message', fields: inner.fields },
            alternatives: ['deprecated group encoding'],
          },
        ],
        failure: closed ? undefined : inner.failure,
      }
    }

    // Wire type 2: length-delimited.
    const length = readVarint(bytes, offset)
    if (!length) return { fields, failure: { reason: 'Truncated length prefix.', offset: start } }
    const contentStart = length.next
    const contentEnd = contentStart + Number(length.value)
    if (contentEnd > to) {
      return { fields, failure: { reason: 'Length runs past the end of the payload.', offset: start } }
    }

    const interpreted = interpretLengthDelimited(bytes, contentStart, contentEnd, depth)
    fields.push({
      fieldNumber,
      wireType,
      offset: start,
      byteLength: contentEnd - start,
      value: interpreted.value,
      alternatives: interpreted.alternatives,
    })
    offset = contentEnd
  }

  return { fields }
}

function interpretLengthDelimited(
  bytes: Uint8Array,
  from: number,
  to: number,
  depth: number,
): { value: WireValue; alternatives: string[] } {
  const content = bytes.subarray(from, to)
  const alternatives: string[] = []

  if (content.length === 0) {
    return { value: { kind: 'bytes', bytes: content }, alternatives: ['empty string', 'empty message'] }
  }

  const text = readUtf8(content)
  const nested = depth < MAX_DEPTH ? parseFields(bytes, from, to, depth + 1) : { fields: [], failure: undefined }
  const parsesAsMessage = !nested.failure && nested.fields.length > 0

  if (parsesAsMessage) {
    // Prefer the structure, and keep the text reading alongside it: the two
    // are genuinely ambiguous, and only the schema settles which was meant.
    if (text !== null && isCleanText(text)) alternatives.push(`string ${JSON.stringify(text)}`)
    return { value: { kind: 'message', fields: nested.fields }, alternatives }
  }

  if (text !== null && isCleanText(text)) {
    return { value: { kind: 'string', text }, alternatives }
  }

  const packed = readPackedVarints(content)
  if (packed && packed.length > 1) {
    alternatives.push(`packed varints ${packed.slice(0, 8).join(', ')}${packed.length > 8 ? ', …' : ''}`)
  }
  if (text !== null) alternatives.push(`string ${JSON.stringify(text)}`)
  return { value: { kind: 'bytes', bytes: content }, alternatives }
}

/** Decodes a payload without a schema. A truncated or non-protobuf payload
 * still returns whatever was read before the trouble, since a partial
 * decode is usually enough to recognize what you are looking at. */
export function decodeWireFormat(bytes: Uint8Array): WireDecodeSuccess | WireDecodeFailure {
  const outcome = parseFields(bytes, 0, bytes.length, 0)
  if (outcome.failure) {
    return { ok: false, reason: outcome.failure.reason, offset: outcome.failure.offset, fields: outcome.fields }
  }
  return { ok: true, fields: outcome.fields, byteLength: bytes.length }
}

/** Flat text rendering of decoded fields, for the copy button. */
export function formatFields(fields: WireField[], indent = 0): string {
  const pad = '  '.repeat(indent)
  return fields
    .map((field) => {
      const head = `${pad}${field.fieldNumber} (${WIRE_TYPE_NAMES[field.wireType]})`
      if (field.value.kind === 'message') {
        return `${head} {\n${formatFields(field.value.fields, indent + 1)}\n${pad}}`
      }
      return `${head}: ${describeValue(field.value)}`
    })
    .join('\n')
}

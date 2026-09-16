/** Decoding a payload *with* its .proto, using protobufjs to parse the
 * schema text at runtime.
 *
 * Runtime parsing is what makes this work as a widget: there is no codegen
 * step and no protoc, the .proto is pasted next to the payload and read on
 * the spot. Everything stays in the browser. */

import protobuf from 'protobufjs'
import type { WireField } from './wireFormat'

/** A .proto pasted into a widget is a message or two, not a repository. */
export const MAX_SCHEMA_LENGTH = 50_000

export interface SchemaMessages {
  ok: true
  /** Fully qualified message names, package included, in declaration order. */
  names: string[]
  root: protobuf.Root
}

export interface SchemaError {
  ok: false
  reason: string
  /** 1-based line the parser objected to, when it says. */
  line?: number
}

/** Parses .proto source and lists the message types it declares.
 *
 * Imports are the one thing that cannot work offline: protobufjs resolves
 * them through the file system, which a browser does not have. The common
 * `google/protobuf/*` types are bundled with protobufjs and do resolve;
 * anything else is reported as the missing piece it is. */
export function parseSchema(source: string): SchemaMessages | SchemaError {
  if (source.trim().length === 0) return { ok: false, reason: 'Paste a .proto definition, or decode without one.' }
  if (source.length > MAX_SCHEMA_LENGTH) {
    return {
      ok: false,
      reason: `Definition is ${source.length.toLocaleString('en-US')} characters; the limit is ${MAX_SCHEMA_LENGTH.toLocaleString('en-US')}.`,
    }
  }

  let root: protobuf.Root
  try {
    // keepCase so a field declared `user_id` is reported as `user_id`
    // rather than protobufjs's camelCased `userId`, which would not match
    // the .proto the user is reading beside it.
    root = protobuf.parse(source, { keepCase: true }).root
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const line = message.match(/line (\d+)/)
    return { ok: false, reason: message, line: line ? Number(line[1]) : undefined }
  }

  try {
    root.resolveAll()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    // The usual case: an `import` of something that is not bundled.
    return {
      ok: false,
      reason: /no such type|not found/i.test(message)
        ? `${message}. Imports other than the bundled google/protobuf types cannot be resolved in the browser; paste the imported messages inline.`
        : message,
    }
  }

  const names: string[] = []
  const walk = (namespace: protobuf.NamespaceBase) => {
    for (const nested of namespace.nestedArray) {
      if (nested instanceof protobuf.Type) {
        names.push(nested.fullName.replace(/^\./, ''))
        walk(nested)
      } else if (nested instanceof protobuf.Namespace) {
        walk(nested)
      }
    }
  }
  walk(root)

  if (names.length === 0) return { ok: false, reason: 'No message types found in this definition.' }
  return { ok: true, names, root }
}

export interface SchemaDecodeSuccess {
  ok: true
  /** Plain object, ready for the JSON tree. */
  value: Record<string, unknown>
  /** What the wire reading and the message type disagree about. protobufjs
   * drops both unknown and mismatched fields silently, which is right for a
   * server and wrong for a debugging tool: a payload that decodes cleanly
   * while quietly discarding half of itself is exactly the confusion this
   * widget exists to clear up. */
  comparison: SchemaComparison
}

/** Wire types a declared field can legitimately arrive as. A repeated
 * scalar is the one case with two answers: proto3 packs it into a single
 * length-delimited field by default, but an older writer may still send one
 * tagged value per element. */
function expectedWireTypes(field: protobuf.Field): Set<number> {
  const scalar: Record<string, number> = {
    int32: 0,
    int64: 0,
    uint32: 0,
    uint64: 0,
    sint32: 0,
    sint64: 0,
    bool: 0,
    fixed64: 1,
    sfixed64: 1,
    double: 1,
    string: 2,
    bytes: 2,
    fixed32: 5,
    sfixed32: 5,
    float: 5,
  }
  // An enum is a varint; anything else named is a nested message, which is
  // length-delimited.
  const base = scalar[field.type] ?? (field.resolvedType instanceof protobuf.Enum ? 0 : 2)
  return field.repeated ? new Set([base, 2]) : new Set([base])
}

export interface SchemaMismatch {
  fieldNumber: number
  /** What the .proto declares for that number. */
  declared: string
  /** What actually turned up on the wire. */
  wireType: number
}

export interface SchemaComparison {
  /** Field numbers on the wire that the message type says nothing about.
   * protobufjs drops them silently. */
  unknownFieldNumbers: number[]
  /** Declared fields whose wire type does not match their declared type:
   * the clearest sign the payload is a different message than the one
   * chosen, since protobufjs skips these without complaining. */
  mismatches: SchemaMismatch[]
}

/** Compares the schema-less reading of the same bytes against the message
 * type, so the two readings check each other rather than being trusted one
 * at a time. */
export function compareWithSchema(root: protobuf.Root, messageName: string, wireFields: WireField[]): SchemaComparison {
  let type: protobuf.Type
  try {
    type = root.lookupType(messageName)
  } catch {
    return { unknownFieldNumbers: [], mismatches: [] }
  }

  const declared = new Map(type.fieldsArray.map((field) => [field.id, field]))
  const unknown = new Set<number>()
  const mismatches = new Map<number, SchemaMismatch>()

  for (const wireField of wireFields) {
    const field = declared.get(wireField.fieldNumber)
    if (!field) {
      unknown.add(wireField.fieldNumber)
      continue
    }
    if (!expectedWireTypes(field).has(wireField.wireType)) {
      mismatches.set(wireField.fieldNumber, {
        fieldNumber: wireField.fieldNumber,
        declared: `${field.repeated ? 'repeated ' : ''}${field.type} ${field.name}`,
        wireType: wireField.wireType,
      })
    }
  }

  return {
    unknownFieldNumbers: [...unknown].sort((a, b) => a - b),
    mismatches: [...mismatches.values()].sort((a, b) => a.fieldNumber - b.fieldNumber),
  }
}

/** Decodes `bytes` as `messageName`. A payload that does not match the
 * chosen message usually fails loudly (bad wire type, length past the end),
 * which is the honest answer: it is the wrong message type. */
export function decodeWithSchema(
  root: protobuf.Root,
  messageName: string,
  bytes: Uint8Array,
  wireFields: WireField[] = [],
): SchemaDecodeSuccess | SchemaError {
  let type: protobuf.Type
  try {
    type = root.lookupType(messageName)
  } catch {
    return { ok: false, reason: `No message type named ${messageName} in this definition.` }
  }

  try {
    const message = type.decode(bytes)
    return {
      ok: true,
      value: type.toObject(message, {
        // Strings for 64-bit values (they outrun a JS number), base64 for
        // bytes, names for enums: the readable form in every case.
        longs: String,
        bytes: String,
        enums: String,
        // No defaults, and no empty arrays or objects for fields the
        // payload does not carry: the point is to show what is actually on
        // the wire, not what the message type could hold.
        defaults: false,
      }),
      comparison: compareWithSchema(root, messageName, wireFields),
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return {
      ok: false,
      reason: `${message}. The payload may not be a ${messageName}, or may be truncated.`,
    }
  }
}

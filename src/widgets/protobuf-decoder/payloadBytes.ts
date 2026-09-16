/** Turns whatever was pasted into the bytes a protobuf decoder can read.
 *
 * Payloads arrive from all over: a base64 string out of a JSON log, hex out
 * of a packet capture or `xxd`, a gRPC frame copied from devtools. The
 * shapes differ but the intent never does, so the encoding is detected
 * rather than asked for, and the widget reports what it decided. */

export type PayloadEncoding = 'auto' | 'base64' | 'hex'

export interface DecodedPayload {
  bytes: Uint8Array
  /** What the text actually turned out to be. */
  encoding: 'base64' | 'hex'
  /** Set when a 5-byte gRPC length prefix was found and skipped. */
  grpcFrame?: { compressed: boolean; length: number }
}

export interface PayloadError {
  error: string
}

/** Characters that carry no information in either encoding: whitespace from
 * wrapped lines, quotes and commas from a pasted code literal. */
const PRESENTATION_NOISE = /[\s,"'`]/g

/** The `0x` markers of a hex dump. Stripped only once the payload is known
 * to be hex: `0`, `x` and `X` are all valid base64 characters, so removing
 * them up front would quietly rewrite a base64 payload that happens to
 * contain them. */
const HEX_PREFIX = /0x/gi

/** Both limits are about keeping a paste from stalling the tab rather than
 * about protobuf itself: the decode is linear, but every field becomes a
 * rendered row. */
export const MAX_INPUT_LENGTH = 100_000
export const MAX_PAYLOAD_BYTES = 64 * 1024

function isHexadecimal(text: string): boolean {
  return text.length % 2 === 0 && text.length > 0 && /^[0-9a-f]+$/i.test(text)
}

function isBase64(text: string): boolean {
  return text.length > 0 && /^[A-Za-z0-9+/\-_]+={0,2}$/.test(text)
}

function fromHex(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function fromBase64(text: string): Uint8Array | null {
  // base64url is the same alphabet with two characters swapped, and pasted
  // values are often missing their padding.
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

/** A gRPC message on the wire is a 1-byte compression flag, a 4-byte
 * big-endian length, then the protobuf itself. Copying one out of devtools
 * brings the frame along, and decoding it as protobuf yields nonsense
 * (field 0), so it is recognized and stripped. */
function readGrpcFrame(bytes: Uint8Array): { body: Uint8Array; compressed: boolean; length: number } | null {
  if (bytes.length < 5) return null
  const flag = bytes[0]
  if (flag !== 0 && flag !== 1) return null
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, false)
  if (length !== bytes.length - 5) return null
  return { body: bytes.subarray(5), compressed: flag === 1, length }
}

/** Decodes pasted text into bytes. Returns `{ error }` rather than throwing,
 * since every failure here is something to show the user: a stray
 * character, a truncated payload, an input past the size limit. */
export function decodePayload(text: string, encoding: PayloadEncoding = 'auto'): DecodedPayload | PayloadError {
  if (text.length > MAX_INPUT_LENGTH) {
    return {
      error: `Payload is ${text.length.toLocaleString('en-US')} characters; the limit is ${MAX_INPUT_LENGTH.toLocaleString('en-US')}.`,
    }
  }

  const normalized = text.replace(PRESENTATION_NOISE, '')
  if (normalized.length === 0) return { error: 'Paste a base64 or hex payload.' }
  const withoutHexPrefixes = normalized.replace(HEX_PREFIX, '')

  let resolved: 'base64' | 'hex'
  if (encoding === 'auto') {
    // Hex wins a tie: a string of hex digits is almost always a hex dump,
    // even though it is also valid base64. The candidate tested here is the
    // one with `0x` markers removed, so `0x08 0x96` is still read as hex.
    resolved = isHexadecimal(withoutHexPrefixes) ? 'hex' : 'base64'
  } else {
    resolved = encoding
  }

  const cleaned = resolved === 'hex' ? withoutHexPrefixes : normalized

  if (resolved === 'hex' && !isHexadecimal(cleaned)) {
    return {
      error:
        cleaned.length % 2 === 1
          ? 'Hex payload has an odd number of digits.'
          : 'Payload contains characters that are not hex digits.',
    }
  }
  if (resolved === 'base64' && !isBase64(cleaned)) {
    return { error: 'Payload is neither valid hex nor valid base64.' }
  }

  const bytes = resolved === 'hex' ? fromHex(cleaned) : fromBase64(cleaned)
  if (!bytes) return { error: 'Payload is not valid base64.' }
  if (bytes.length === 0) return { error: 'Payload decoded to zero bytes.' }
  if (bytes.length > MAX_PAYLOAD_BYTES) {
    return {
      error: `Payload is ${bytes.length.toLocaleString('en-US')} bytes; the limit is ${MAX_PAYLOAD_BYTES.toLocaleString('en-US')}.`,
    }
  }

  const frame = readGrpcFrame(bytes)
  if (frame) {
    return {
      bytes: frame.body,
      encoding: resolved,
      grpcFrame: { compressed: frame.compressed, length: frame.length },
    }
  }

  return { bytes, encoding: resolved }
}

/** Hex for display, used for byte values the decoder can't read as anything
 * more specific. */
export function toHex(bytes: Uint8Array, maxBytes = 32): string {
  const shown = [...bytes.subarray(0, maxBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
  return bytes.length > maxBytes ? `${shown} … (${bytes.length} bytes)` : shown
}

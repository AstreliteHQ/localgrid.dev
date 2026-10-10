/** Pure detection engine behind the Content Type Detector widget.
 *
 * The core idea: some inputs are themselves a recognizable format (JSON,
 * JWT, UUID, a URL, …) and some are just an *encoding* wrapped around
 * something else (Base64, hex, percent-encoding). For the latter we decode
 * one layer and run detection again on the result, so pasting something
 * like base64(base64(JSON)) surfaces as a chain: Base64 → Base64 → JSON,
 * not just "Base64" with an unreadable blob underneath.
 */

import { decodeLzStringStrict } from '@/lib/lzString'

/** One layer of a detection chain. `value` is what that layer represents —
 * the decoded text for a peeled encoding layer, or a display-friendly
 * preview for a terminal ("leaf") classification like a UUID or timestamp. */
export interface DetectionNode {
  /** Stable key for the type, e.g. 'base64', 'jwt', 'json'. Not shown in the UI. */
  type: string
  /** Human label shown in the UI, e.g. 'Base64', 'JWT', 'JSON'. */
  label: string
  /** 0..1 confidence this layer's classification is correct. */
  confidence: number
  value: string
}

export type DetectionChain = DetectionNode[]

/** Candidate produced by `detectCandidates` for one piece of text. Leaf
 * candidates (no `decode`) end a chain; peelable candidates may continue
 * into another round of detection on their decoded output. */
interface Candidate extends DetectionNode {
  decode?: () => string
}

/** Chain length is capped at 3 layers — deep chains stop being informative
 * and just as often mean we're peeling noise, not signal. */
const MAX_CHAIN_LENGTH = 3
/** Only the top-N candidates are explored per layer, to keep the branching
 * factor (and the list of chains shown) manageable. */
const MAX_BRANCHES_PER_LEVEL = 3
const MAX_CHAINS_SHOWN = 6
/** Guards against pathological input (huge pastes) making detection slow. */
const MAX_INPUT_LENGTH = 20_000

const HASH_HEX_LENGTHS: Record<number, string> = {
  32: 'MD5',
  40: 'SHA-1',
  64: 'SHA-256',
  96: 'SHA-384',
  128: 'SHA-512',
}

/** Fraction of characters that are "normal" text rather than control bytes —
 * used to tell a meaningful decode (readable text, JSON, …) from noise that
 * happened to survive a UTF-8 decode. Tab/CR/LF count as printable; general
 * non-ASCII (accented text, CJK, emoji, …) does too, since this is meant to
 * accept real-world Unicode content, not just ASCII. */
function printableRatio(text: string): number {
  if (text.length === 0) return 0
  let printable = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127) || code > 160) {
      printable++
    }
  }
  return printable / text.length
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Decodes standard Base64 or Base64URL to raw bytes, tolerating missing
 * padding. Returns null for anything that isn't validly-shaped Base64 —
 * says nothing about what the bytes contain, unlike the old
 * text-decoding version this replaces, so callers can inspect the bytes
 * themselves (e.g. for a gzip magic number) before assuming they're text. */
function decodeBase64Bytes(text: string): Uint8Array | null {
  if (text.length < 4 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return null
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (normalized.length % 4)) % 4
  if (padLength === 3) return null // not a valid base64 length
  try {
    const binary = atob(normalized + '='.repeat(padLength))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/** Decodes bytes as UTF-8, returning null (rather than throwing) for
 * anything that isn't valid UTF-8 — the shared "is this actually text"
 * gate every peelable encoding uses before offering its decoded form. */
function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function decodeJwtHeader(token: string): Record<string, unknown> | null {
  try {
    const [header] = token.split('.')
    const bytes = decodeBase64Bytes(header)
    const json = bytes && decodeUtf8(bytes)
    if (!json) return null
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Crockford's Base32 alphabet (used by ULID) — RFC 4648 Base32 minus
 * I/L/O/U, to avoid confusion with 1/0. */
const CROCKFORD32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** RFC 4648 Base32 alphabet (TOTP secrets, DNS labels, etc). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
/** Bitcoin/IPFS-style Base58 alphabet — Base64's alphabet minus the
 * visually-ambiguous 0/O/I/l. */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function decodeBase32Bytes(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '').toUpperCase()
  if (clean.length < 2) return null
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const digit = BASE32_ALPHABET.indexOf(char)
    if (digit === -1) return null
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(bytes)
}

function decodeBase58Bytes(text: string): Uint8Array | null {
  if (!text) return null
  let value = 0n
  for (const char of text) {
    const digit = BASE58_ALPHABET.indexOf(char)
    if (digit === -1) return null
    value = value * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn))
    value >>= 8n
  }
  // Each leading '1' represents a leading zero byte (base58's analogue of
  // leading zeros not collapsing away, the same way "01" isn't just "1").
  for (const char of text) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

/** Recognizes gzip/zlib-compressed bytes by their magic number. There's no
 * bundled inflate implementation here (no compression library is a
 * dependency of this project, and the browser's DecompressionStream is
 * stream/async-only, which doesn't fit this module's synchronous API) — so
 * this identifies the format without decompressing it, same spirit as the
 * hash-length heuristic below. */
function detectCompression(bytes: Uint8Array): { label: string; confidence: number } | null {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { label: 'Gzip-compressed data', confidence: 0.9 }
  }
  // zlib header: first byte 0x78 is by far the most common (32K window);
  // second byte is one of a handful of standard compression-level flags.
  if (bytes.length >= 2 && bytes[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(bytes[1])) {
    return { label: 'Zlib-compressed data', confidence: 0.6 }
  }
  return null
}

/** Returns every pattern `text` plausibly matches, most confident first.
 * Several candidates can (and often do) apply at once — e.g. a lowercase
 * hex string is simultaneously "possible SHA-256 hash" and "hex bytes" —
 * callers explore more than one. */
export function detectCandidates(input: string): Candidate[] {
  const text = input.trim()
  const candidates: Candidate[] = []
  if (!text) return candidates

  // Base64/hex are commonly wrapped at a fixed line width (PEM-style) or
  // copied with surrounding whitespace; the other detectors care about
  // exact shape, so only these two tolerate that by working on a
  // whitespace-stripped copy.
  const compact = text.replace(/\s+/g, '')

  // JWT — three dot-separated Base64URL segments whose header decodes to a
  // JSON object with the claims a JWT header actually has.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) {
    const header = decodeJwtHeader(text)
    if (header && ('alg' in header || 'typ' in header)) {
      candidates.push({ type: 'jwt', label: 'JWT', confidence: 0.97, value: text })
    }
  }

  // JSON object/array (a bare string/number/bool isn't distinctive enough
  // to call out as "JSON"). A JWK is JSON too, but is specific enough
  // (a "kty" member) to get its own, more informative label instead of
  // showing up as both.
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed: unknown = JSON.parse(text)
      const isJwk = parsed !== null && typeof parsed === 'object' && 'kty' in (parsed as object)
      candidates.push(
        isJwk
          ? { type: 'jwk', label: 'JWK (JSON Web Key)', confidence: 0.93, value: text }
          : { type: 'json', label: 'JSON', confidence: 0.9, value: text },
      )
    } catch {
      // not valid JSON
    }
  }

  // PEM block (certificate, public/private key, CSR, …) — the label names
  // the concrete kind (e.g. "PEM (CERTIFICATE)") straight from the header.
  const pemMatch = /^-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*-----END \1-----\s*$/.exec(text)
  if (pemMatch) {
    candidates.push({ type: 'pem', label: `PEM (${pemMatch[1]})`, confidence: 0.95, value: text })
  }

  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    candidates.push({ type: 'uuid', label: 'UUID', confidence: 0.95, value: text })
  }

  // ULID — 26-char Crockford Base32, timestamp-first. Confirming the
  // leading 10 chars decode to a plausible calendar date (like the Unix
  // timestamp check above) is what separates this from an arbitrary
  // 26-char string that merely fits the alphabet.
  if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(text)) {
    let ms = 0
    for (const char of text.slice(0, 10).toUpperCase()) {
      ms = ms * 32 + CROCKFORD32_ALPHABET.indexOf(char)
    }
    const year = new Date(ms).getUTCFullYear()
    if (year >= 1990 && year <= 2100) {
      candidates.push({
        type: 'ulid',
        label: `ULID → ${new Date(ms).toISOString()}`,
        confidence: 0.75,
        value: text,
      })
    }
  }

  // Password hash formats identifiable by their fixed prefix — each is
  // distinctive enough to be high-confidence on its own.
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(text)) {
    candidates.push({ type: 'bcrypt', label: 'bcrypt hash', confidence: 0.95, value: text })
  }
  if (/^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$/.test(text)) {
    candidates.push({ type: 'argon2', label: 'Argon2 hash', confidence: 0.95, value: text })
  }
  if (/^\$1\$[./0-9A-Za-z]{1,8}\$[./0-9A-Za-z]{22}$/.test(text)) {
    candidates.push({ type: 'md5crypt', label: 'md5crypt hash', confidence: 0.9, value: text })
  }

  // MAC address
  if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(text)) {
    candidates.push({ type: 'mac', label: 'MAC address', confidence: 0.9, value: text })
  }

  // IPv6 address (a widely-used comprehensive pattern covering the full
  // range of valid shorthand forms, including embedded IPv4 and zone IDs).
  if (
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/.test(
      text,
    )
  ) {
    candidates.push({ type: 'ipv6', label: 'IPv6 address', confidence: 0.9, value: text })
  }

  // URL
  try {
    const url = new URL(text)
    if (/^https?:$/.test(url.protocol) || /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol)) {
      candidates.push({ type: 'url', label: 'URL', confidence: 0.9, value: text })
    }
  } catch {
    // not a URL
  }

  // IPv4 address / CIDR
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d{1,2}))?$/.exec(text)
  if (ipv4Match) {
    const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map(Number)
    const prefix = ipv4Match[6] === undefined ? null : Number(ipv4Match[6])
    if (octets.every((n) => n <= 255) && (prefix === null || prefix <= 32)) {
      candidates.push({
        type: 'ipv4',
        label: prefix === null ? 'IPv4 address' : 'IPv4 CIDR',
        confidence: 0.9,
        value: text,
      })
    }
  }

  // Unix timestamp (seconds or milliseconds), sanity-checked against a
  // plausible calendar range rather than accepted on digit-count alone.
  if (/^\d{9,13}$/.test(text)) {
    const n = Number(text)
    const isMillis = text.length >= 13
    const date = new Date(isMillis ? n : n * 1000)
    const year = date.getUTCFullYear()
    if (year >= 1990 && year <= 2100) {
      candidates.push({
        type: 'timestamp',
        label: `Unix timestamp (${isMillis ? 'ms' : 'seconds'})`,
        confidence: 0.55,
        value: date.toISOString(),
      })
    }
  }

  // Hex color — with a leading # this is unambiguous; without one it's the
  // same alphabet as hex bytes/Base64, so it's kept but heavily discounted.
  if (/^#?[0-9a-f]{3}$|^#?[0-9a-f]{6}$|^#?[0-9a-f]{8}$/i.test(text)) {
    candidates.push({
      type: 'color',
      label: 'Hex color',
      confidence: text.startsWith('#') ? 0.85 : 0.4,
      value: text.startsWith('#') ? text : `#${text}`,
    })
  }

  // Hex string matching a common hash digest length. This never decodes
  // into anything, so it's a leaf — offered alongside (not instead of) the
  // "hex bytes" peel below, since either reading can be right.
  if (/^[0-9a-f]+$/i.test(compact) && HASH_HEX_LENGTHS[compact.length]) {
    candidates.push({
      type: 'hash',
      label: `Hex string (possible ${HASH_HEX_LENGTHS[compact.length]} hash)`,
      confidence: 0.35,
      value: compact,
    })
  }

  // Hex-encoded bytes — a compressed payload is reported as a leaf (see
  // detectCompression); otherwise it's peelable when it decodes to
  // readable UTF-8 text.
  if (/^[0-9a-f]+$/i.test(compact) && compact.length >= 4 && compact.length % 2 === 0) {
    const bytes = hexToBytes(compact)
    const compression = detectCompression(bytes)
    if (compression) {
      candidates.push({
        type: 'hex-compressed',
        label: `Hex-encoded ${compression.label}`,
        confidence: compression.confidence,
        value: compact,
      })
    } else {
      const decoded = decodeUtf8(bytes)
      const ratio = decoded === null ? 0 : printableRatio(decoded)
      if (decoded !== null && ratio > 0.85) {
        candidates.push({
          type: 'hex',
          label: 'Hex-encoded bytes',
          confidence: 0.4 + 0.3 * ratio,
          value: decoded,
          decode: () => decoded,
        })
      }
    }
  }

  // Base64 / Base64URL — same compressed-vs-readable-text split as hex above.
  const base64Bytes = decodeBase64Bytes(compact)
  if (base64Bytes !== null) {
    const urlSafe = /[-_]/.test(compact)
    const base64Label = urlSafe ? 'Base64 (URL-safe)' : 'Base64'
    const compression = detectCompression(base64Bytes)
    if (compression) {
      candidates.push({
        type: 'base64-compressed',
        label: `${base64Label} ${compression.label}`,
        confidence: compression.confidence,
        value: compact,
      })
    } else {
      const decoded = decodeUtf8(base64Bytes)
      const ratio = decoded === null ? 0 : printableRatio(decoded)
      if (decoded !== null && decoded !== compact && ratio > 0.85) {
        candidates.push({
          type: 'base64',
          label: base64Label,
          confidence: 0.5 + 0.4 * ratio,
          value: decoded,
          decode: () => decoded,
        })
      }
    }
  }

  // Base32 (RFC 4648) — e.g. TOTP secrets, DNS labels. Readable-text decodes
  // peel like Base64/hex above; an unreadable decode is still offered as a
  // low-confidence "opaque secret" leaf, since most real Base32 payloads
  // (TOTP keys in particular) are raw bytes, not text. Base32's alphabet is
  // literally the full A-Z alongside 2-7, so — unlike hex or Base64 — a
  // plain lowercase word like "helloworld" fits it too; requiring at least
  // one of the digits is what keeps ordinary text from matching, since a
  // random Base32 string of any real length almost always contains one.
  if (/^[A-Z2-7]{8,}=*$/i.test(compact) && /[2-7]/.test(compact)) {
    const bytes = decodeBase32Bytes(compact)
    if (bytes && bytes.length > 0) {
      const decoded = decodeUtf8(bytes)
      const ratio = decoded === null ? 0 : printableRatio(decoded)
      if (decoded !== null && ratio > 0.85) {
        candidates.push({
          type: 'base32',
          label: 'Base32',
          confidence: 0.4 + 0.3 * ratio,
          value: decoded,
          decode: () => decoded,
        })
      } else {
        candidates.push({
          type: 'base32-opaque',
          label: 'Base32 (e.g. a TOTP secret)',
          confidence: 0.3,
          value: compact,
        })
      }
    }
  }

  // Base58 (Bitcoin/IPFS-style) — real addresses/CIDs decode to raw bytes
  // (a hash plus checksum), not text, so — like Base32 above — an
  // unreadable decode is still worth surfacing, gated by the length real
  // addresses/CIDs actually fall in to keep it from firing on short words.
  // Upper-bounded well past any real Base58 payload (addresses/CIDs top out
  // around 44 chars) because decodeBase58Bytes is O(n²) — it repeatedly
  // multiplies a growing BigInt, so an unbounded match on a large paste
  // (up to MAX_INPUT_LENGTH) measured ~180ms on its own, on every keystroke.
  if (/^[1-9A-HJ-NP-Za-km-z]{16,100}$/.test(compact)) {
    const bytes = decodeBase58Bytes(compact)
    if (bytes && bytes.length > 0) {
      const decoded = decodeUtf8(bytes)
      const ratio = decoded === null ? 0 : printableRatio(decoded)
      if (decoded !== null && ratio > 0.85) {
        candidates.push({
          type: 'base58',
          label: 'Base58',
          confidence: 0.4 + 0.3 * ratio,
          value: decoded,
          decode: () => decoded,
        })
      } else if (compact.length >= 25 && compact.length <= 44) {
        candidates.push({
          type: 'base58-opaque',
          label: 'Base58 (e.g. a Bitcoin address or IPFS CID)',
          confidence: 0.35,
          value: compact,
        })
      }
    }
  }

  // LZ-String (compressToEncodedURIComponent) — the compact, URL-safe format
  // this app's own share links use. The round-trip check inside
  // decodeLzStringStrict is a near-certain signal (an arbitrary string reproducing
  // itself through decode -> recompress is vanishingly unlikely by chance),
  // so this gets a high confidence with no separate readable-text ratio gate.
  const lzDecoded = decodeLzStringStrict(compact)
  if (lzDecoded !== null) {
    candidates.push({
      type: 'lz-string',
      label: 'LZ-String',
      confidence: 0.85,
      value: lzDecoded,
      decode: () => lzDecoded,
    })
  }

  // Percent-encoding (URI component escaping)
  if (/%[0-9a-f]{2}/i.test(text)) {
    try {
      const decoded = decodeURIComponent(text)
      if (decoded !== text) {
        candidates.push({
          type: 'url-encoded',
          label: 'URL-encoded (percent)',
          confidence: 0.65,
          value: decoded,
          decode: () => decoded,
        })
      }
    } catch {
      // malformed percent-encoding
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence)
}

function chainKey(chain: DetectionChain): string {
  return chain.map((node) => `${node.type}:${node.value.slice(0, 80)}`).join('|')
}

function chainScore(chain: DetectionChain): number {
  return chain.reduce((score, node) => score * node.confidence, 1)
}

/** Detects what `input` might be, peeling recognized encodings (Base64,
 * hex, percent-encoding) up to `MAX_CHAIN_LENGTH` layers deep and running
 * detection again on each decoded result. Returns the resulting chains —
 * each one a top-to-bottom read like "Base64 → JSON" — ranked by their
 * combined confidence, most likely first. Always non-empty for non-blank
 * input: a chain that recognizes nothing still ends in a "Plain text" leaf. */
export function buildChains(rawInput: string): DetectionChain[] {
  const text = rawInput.trim().slice(0, MAX_INPUT_LENGTH)
  if (!text) return []

  const chains: DetectionChain[] = []
  const seen = new Set<string>()

  function pushChain(chain: DetectionChain) {
    const key = chainKey(chain)
    if (seen.has(key)) return
    seen.add(key)
    chains.push(chain)
  }

  function walk(current: string, path: DetectionChain) {
    const candidates = detectCandidates(current).slice(0, MAX_BRANCHES_PER_LEVEL)

    if (candidates.length === 0) {
      pushChain([
        ...path,
        { type: 'text', label: 'Plain text', confidence: path.length > 0 ? 0.6 : 0.3, value: current },
      ])
      return
    }

    for (const { decode, ...node } of candidates) {
      const nextPath = [...path, node]
      if (decode && nextPath.length < MAX_CHAIN_LENGTH) {
        const decoded = decode()
        if (decoded && decoded !== current) {
          walk(decoded, nextPath)
          continue
        }
      }
      pushChain(nextPath)
    }
  }

  walk(text, [])

  return chains.sort((a, b) => chainScore(b) - chainScore(a)).slice(0, MAX_CHAINS_SHOWN)
}

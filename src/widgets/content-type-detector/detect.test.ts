import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { buildChains } from './detect'

function labels(chain: ReturnType<typeof buildChains>[number]): string[] {
  return chain.map((node) => node.label)
}

describe('buildChains', () => {
  it('returns nothing for blank input', () => {
    expect(buildChains('')).toEqual([])
    expect(buildChains('   \n  ')).toEqual([])
  })

  it('falls back to Plain text for ordinary prose', () => {
    const chains = buildChains('just some ordinary sentence, nothing special here')
    expect(chains).toHaveLength(1)
    expect(labels(chains[0])).toEqual(['Plain text'])
  })

  it('detects a UUID', () => {
    const chains = buildChains('550e8400-e29b-41d4-a716-446655440000')
    expect(labels(chains[0])).toEqual(['UUID'])
  })

  it('detects a URL', () => {
    const chains = buildChains('https://example.com/path?query=1')
    expect(labels(chains[0])).toEqual(['URL'])
  })

  it('detects an IPv4 CIDR', () => {
    const chains = buildChains('192.168.1.0/24')
    expect(labels(chains[0])).toEqual(['IPv4 CIDR'])
  })

  it('detects a plausible unix timestamp in seconds', () => {
    const chains = buildChains('1700000000')
    const chain = chains.find((c) => c[0].type === 'timestamp')
    expect(chain).toBeDefined()
    expect(chain?.[0].value).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('detects a leading-# hex color with high confidence', () => {
    const chains = buildChains('#1a2b3c')
    expect(labels(chains[0])).toEqual(['Hex color'])
    expect(chains[0][0].value).toBe('#1a2b3c')
  })

  it('offers both hash and hex-bytes readings for a bare hex string', () => {
    // 64 lowercase hex chars ('61' x32, i.e. the byte 0x61 repeated): same
    // shape as a SHA-256 digest, but also decodes (as bytes) to readable
    // ASCII ("aaa…a"), so both readings should surface.
    const hex = '61'.repeat(32)
    const chains = buildChains(hex)
    const allLabels = chains.flatMap(labels)
    expect(allLabels).toContain('Hex string (possible SHA-256 hash)')
    expect(allLabels.some((l) => l === 'Hex-encoded bytes')).toBe(true)
  })

  it('decodes Base64 down to plain text', () => {
    const chains = buildChains(btoa('hello world'))
    const chain = chains.find((c) => labels(c)[0] === 'Base64')
    expect(chain).toBeDefined()
    expect(labels(chain!)).toEqual(['Base64', 'Plain text'])
    expect(chain![1].value).toBe('hello world')
  })

  it('chains Base64 -> JSON', () => {
    const json = JSON.stringify({ hello: 'world' })
    const chains = buildChains(btoa(json))
    const chain = chains.find((c) => labels(c).includes('JSON'))
    expect(chain).toBeDefined()
    expect(labels(chain!)).toEqual(['Base64', 'JSON'])
    expect(chain![1].value).toBe(json)
  })

  it('chains Base64 -> Base64 -> JSON, capped at 3 layers', () => {
    const json = JSON.stringify({ nested: true })
    const doubled = btoa(btoa(json))
    const chains = buildChains(doubled)
    const chain = chains.find((c) => labels(c).join('>') === 'Base64>Base64>JSON')
    expect(chain).toBeDefined()
    expect(chain).toHaveLength(3)
    expect(chain![2].value).toBe(json)
  })

  it('chains Base64 -> JWT', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '')
    const payload = btoa(JSON.stringify({ sub: '1234' })).replace(/=+$/, '')
    const jwt = `${header}.${payload}.signature`
    const chains = buildChains(btoa(jwt))
    const chain = chains.find((c) => labels(c).join('>') === 'Base64>JWT')
    expect(chain).toBeDefined()
    expect(chain![1].value).toBe(jwt)
  })

  it('detects a bare JWT directly (no Base64 wrapper)', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '')
    const payload = btoa(JSON.stringify({ sub: '1234' })).replace(/=+$/, '')
    const jwt = `${header}.${payload}.signature`
    const chains = buildChains(jwt)
    expect(labels(chains[0])).toEqual(['JWT'])
  })

  it('decodes percent-encoded text', () => {
    const chains = buildChains(encodeURIComponent('hello world/?'))
    const chain = chains.find((c) => labels(c)[0] === 'URL-encoded (percent)')
    expect(chain).toBeDefined()
    expect(chain![1].value).toBe('hello world/?')
  })

  it('does not treat gibberish base64-shaped noise as a meaningful peel', () => {
    // Valid base64 alphabet/length, but decodes to bytes that aren't valid
    // UTF-8 — should not be offered as a Base64 candidate.
    const chains = buildChains('////////')
    expect(chains.every((c) => !labels(c).includes('Base64'))).toBe(true)
  })

  it('decodes Base32 down to plain text', () => {
    // RFC 4648 Base32 of "hello world".
    const chains = buildChains('NBSWY3DPEB3W64TMMQ======')
    const chain = chains.find((c) => labels(c)[0] === 'Base32')
    expect(chain).toBeDefined()
    expect(chain![1].value).toBe('hello world')
  })

  it('offers an opaque-secret reading for Base32 that decodes to binary', () => {
    const chains = buildChains('32W353YBAIBQIBIGA4EASEARCIJRIFIW')
    expect(chains.some((c) => labels(c)[0] === 'Base32 (e.g. a TOTP secret)')).toBe(true)
  })

  it('does not mistake an ordinary word for Base32 just for fitting its alphabet', () => {
    // All-letters, no digit 2-7 — same trap as "helloworld" fitting Base32's
    // A-Z2-7 alphabet by coincidence.
    const chains = buildChains(btoa('helloworld'))
    const chain = chains.find((c) => labels(c)[0] === 'Base64')
    expect(chain).toBeDefined()
    expect(labels(chain!)).toEqual(['Base64', 'Plain text'])
  })

  it('decodes Base58 down to plain text', () => {
    const chains = buildChains('5L9GKndxjFYsHbGcjq7wTBJCK')
    const chain = chains.find((c) => labels(c)[0] === 'Base58')
    expect(chain).toBeDefined()
    expect(chain![1].value).toBe('hello base58 world')
  })

  it('offers a crypto-address reading for Base58 in address-length range', () => {
    const chains = buildChains('1DYwPTpZuLjY18qGUx3bnXcwvb5aos6LRh')
    expect(chains.some((c) => labels(c)[0].startsWith('Base58 ('))).toBe(true)
  })

  it('stays fast on a large Base58-shaped paste (regression: BigInt decode is O(n^2))', () => {
    // decodeBase58Bytes repeatedly multiplies a growing BigInt, so an
    // unbounded match on a near-MAX_INPUT_LENGTH paste used to cost ~180ms
    // on its own, recomputed on every keystroke via useMemo. No real
    // Base58 payload is anywhere near this long, hence the upper bound.
    const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    const noise = Array.from({ length: 20_000 }, (_, i) => base58Alphabet[i % base58Alphabet.length]).join('')

    const start = performance.now()
    buildChains(noise)
    expect(performance.now() - start).toBeLessThan(50)
  })

  it('recognizes gzip-compressed bytes wrapped in Base64 or hex, without decompressing', () => {
    const gzipBytes = [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff, 0x01, 0x02, 0x03, 0x04]
    const asBase64 = btoa(String.fromCharCode(...gzipBytes))
    const asHex = gzipBytes.map((b) => b.toString(16).padStart(2, '0')).join('')

    expect(buildChains(asBase64).some((c) => labels(c)[0].includes('Gzip-compressed data'))).toBe(true)
    expect(buildChains(asHex).some((c) => labels(c)[0].includes('Gzip-compressed data'))).toBe(true)
  })

  it('detects an IPv6 address, full and compressed', () => {
    expect(labels(buildChains('2001:0db8:85a3:0000:0000:8a2e:0370:7334')[0])).toEqual(['IPv6 address'])
    expect(labels(buildChains('::1')[0])).toEqual(['IPv6 address'])
  })

  it('detects a MAC address', () => {
    expect(labels(buildChains('00:1A:2B:3C:4D:5E')[0])).toEqual(['MAC address'])
  })

  it('detects a bcrypt hash', () => {
    const hash = `$2b$12$${'N'.repeat(53)}`
    expect(labels(buildChains(hash)[0])).toEqual(['bcrypt hash'])
  })

  it('detects an argon2 hash', () => {
    const hash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaHZhbHVl'
    expect(labels(buildChains(hash)[0])).toEqual(['Argon2 hash'])
  })

  it('detects an md5crypt hash', () => {
    const hash = `$1$abcdefgh$${'N'.repeat(22)}`
    expect(labels(buildChains(hash)[0])).toEqual(['md5crypt hash'])
  })

  it('detects a ULID and decodes its embedded timestamp', () => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const ms = Date.UTC(2024, 0, 1)
    let time = ''
    let remaining = ms
    for (let i = 0; i < 10; i++) {
      time = alphabet[remaining % 32] + time
      remaining = Math.floor(remaining / 32)
    }
    const ulid = time + '0'.repeat(16)

    const chains = buildChains(ulid)
    const chain = chains.find((c) => c[0].type === 'ulid')
    expect(chain).toBeDefined()
    expect(chain![0].label).toContain(new Date(ms).toISOString())
  })

  it('labels a JSON Web Key distinctly from generic JSON', () => {
    const jwk = JSON.stringify({ kty: 'RSA', n: 'abc', e: 'AQAB' })
    expect(labels(buildChains(jwk)[0])).toEqual(['JWK (JSON Web Key)'])
  })

  it('decodes an LZ-String payload down to plain text', () => {
    const chains = buildChains(LZString.compressToEncodedURIComponent('hello lz-string world'))
    const chain = chains.find((c) => labels(c)[0] === 'LZ-String')
    expect(chain).toBeDefined()
    expect(labels(chain!)).toEqual(['LZ-String', 'Plain text'])
    expect(chain![1].value).toBe('hello lz-string world')
  })

  it("chains LZ-String -> JSON, the shape this app's own share links use", () => {
    const json = JSON.stringify({ dashboards: [], activeDashboardId: 'a' })
    const chains = buildChains(LZString.compressToEncodedURIComponent(json))
    const chain = chains.find((c) => labels(c).join('>') === 'LZ-String>JSON')
    expect(chain).toBeDefined()
    expect(chain![1].value).toBe(json)
  })

  it('does not mistake ordinary alphanumeric noise for LZ-String', () => {
    const chains = buildChains('abcdefghijklmnop1234567890')
    expect(chains.every((c) => !labels(c).includes('LZ-String'))).toBe(true)
  })

  it('detects a PEM block', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END CERTIFICATE-----'
    expect(labels(buildChains(pem)[0])).toEqual(['PEM (CERTIFICATE)'])
  })

  it.each(['y', 'z', 'zz', 'zy'])(
    'falls back to Plain text instead of throwing for %j (regression: LZ-String decode threw)',
    (input) => {
      const chains = buildChains(input)
      expect(chains).toHaveLength(1)
      expect(labels(chains[0])).toEqual(['Plain text'])
    },
  )

  it('never throws on any one- or two-character input', () => {
    // Short, half-typed input is exactly what every keystroke feeds this, and
    // the decoders behind it (LZ-String in particular) have thrown on it before.
    const alphabet =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=-_.%$#:{}[]" \n\u00e9\u4e2d\ud83d\ude00\ud800'
    for (const a of alphabet) {
      expect(() => buildChains(a)).not.toThrow()
      for (const b of alphabet) {
        expect(() => buildChains(a + b)).not.toThrow()
      }
    }
  })
})

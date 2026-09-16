import { describe, expect, it } from 'vitest'
import { decodePayload, MAX_INPUT_LENGTH, MAX_PAYLOAD_BYTES, toHex } from './payloadBytes'

function bytesOf(result: ReturnType<typeof decodePayload>): number[] {
  if ('error' in result) throw new Error(result.error)
  return [...result.bytes]
}

describe('decodePayload', () => {
  it('reads hex, with or without the noise a dump brings along', () => {
    expect(bytesOf(decodePayload('089601'))).toEqual([0x08, 0x96, 0x01])
    expect(bytesOf(decodePayload('08 96 01'))).toEqual([0x08, 0x96, 0x01])
    expect(bytesOf(decodePayload('0x08, 0x96, 0x01'))).toEqual([0x08, 0x96, 0x01])
    expect(bytesOf(decodePayload('08\n96\n01'))).toEqual([0x08, 0x96, 0x01])
  })

  it('reads base64, including base64url and missing padding', () => {
    expect(bytesOf(decodePayload('CJYB'))).toEqual([0x08, 0x96, 0x01])
    expect(bytesOf(decodePayload('CJYBEgd0ZXN0aW5n')).slice(0, 3)).toEqual([0x08, 0x96, 0x01])
    // "+/" against "-_", and no trailing "=".
    expect(bytesOf(decodePayload('-_8'))).toEqual(bytesOf(decodePayload('+/8=')))
  })

  it('prefers hex when the text is valid as both', () => {
    const result = decodePayload('089601')
    expect('error' in result ? null : result.encoding).toBe('hex')
  })

  it('honours an explicit encoding over the guess', () => {
    const asBase64 = decodePayload('089601', 'base64')
    expect('error' in asBase64 ? null : asBase64.encoding).toBe('base64')
    expect(bytesOf(asBase64)).toEqual([0xd3, 0xcf, 0x7a, 0xd3])
  })

  it('strips a gRPC length prefix and says it did', () => {
    // 00 (uncompressed) + length 3 + the payload itself.
    const result = decodePayload('0000000003089601')
    if ('error' in result) throw new Error(result.error)
    expect([...result.bytes]).toEqual([0x08, 0x96, 0x01])
    expect(result.grpcFrame).toEqual({ compressed: false, length: 3 })
  })

  it('leaves bytes alone when the length prefix does not match', () => {
    const result = decodePayload('0000000099089601')
    if ('error' in result) throw new Error(result.error)
    expect(result.bytes.length).toBe(8)
    expect(result.grpcFrame).toBeUndefined()
  })

  it('reports what is wrong instead of throwing', () => {
    expect(decodePayload('')).toEqual({ error: 'Paste a base64 or hex payload.' })
    expect(decodePayload('08960', 'hex')).toEqual({ error: 'Hex payload has an odd number of digits.' })
    expect(decodePayload('zz zz', 'hex')).toEqual({ error: 'Payload contains characters that are not hex digits.' })
    expect(decodePayload('not valid!!')).toEqual({ error: 'Payload is neither valid hex nor valid base64.' })
  })

  it('refuses input past the limits', () => {
    const tooLong = 'a'.repeat(MAX_INPUT_LENGTH + 1)
    expect(decodePayload(tooLong)).toEqual({ error: expect.stringContaining('the limit is 100,000') })

    // Base64 packs 3 bytes into 4 characters, so this clears the character
    // limit and still blows past the byte one. It deliberately uses
    // characters outside the hex alphabet, or the guess would read it as a
    // hex dump (half the bytes) instead.
    const tooManyBytes = 'Zm9v'.repeat(22_500)
    expect(tooManyBytes.length).toBeLessThan(MAX_INPUT_LENGTH)
    expect(decodePayload(tooManyBytes)).toEqual({
      error: expect.stringContaining(`the limit is ${MAX_PAYLOAD_BYTES.toLocaleString('en-US')}`),
    })
  })
})

describe('toHex', () => {
  it('spaces bytes out and truncates long runs', () => {
    expect(toHex(new Uint8Array([0x08, 0x96, 0x01]))).toBe('08 96 01')
    expect(toHex(new Uint8Array(40), 4)).toBe('00 00 00 00 … (40 bytes)')
  })
})

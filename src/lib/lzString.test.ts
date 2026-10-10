import LZString from 'lz-string'
import { describe, expect, it } from 'vitest'
import { decodeLzStringStrict, decompressLzString } from './lzString'

// Inputs the library itself throws on (a TypeError reading past the end of
// its dictionary) instead of returning null.
const THROWING_INPUTS = ['y', 'z', 'zz', 'zzz', 'zy']

describe('decompressLzString', () => {
  it.each(THROWING_INPUTS)('returns null instead of throwing for %j', (input) => {
    expect(() => LZString.decompressFromEncodedURIComponent(input)).toThrow()
    expect(decompressLzString(input)).toBeNull()
  })

  it('decodes a real payload', () => {
    expect(decompressLzString(LZString.compressToEncodedURIComponent('hello'))).toBe('hello')
  })
})

describe('decodeLzStringStrict', () => {
  it.each(THROWING_INPUTS)('returns null instead of throwing for %j', (input) => {
    expect(decodeLzStringStrict(input)).toBeNull()
  })

  it('rejects text that only superficially decodes', () => {
    expect(decodeLzStringStrict('helloworld')).toBeNull()
  })

  it('decodes a real payload', () => {
    expect(decodeLzStringStrict(LZString.compressToEncodedURIComponent('{"a":1}'))).toBe('{"a":1}')
  })
})

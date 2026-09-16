import { describe, expect, it } from 'vitest'
import {
  ALL_UNITS,
  BINARY_UNITS,
  BIT_UNIT,
  BYTE_UNIT,
  DECIMAL_UNITS,
  findUnit,
  fromBytes,
  parseSize,
  toBytes,
} from './fileSizeConversions'

describe('unit definitions', () => {
  it('gives every unit a unique id', () => {
    const ids = ALL_UNITS.map((unit) => unit.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds the decimal system on powers of 1000', () => {
    expect(DECIMAL_UNITS.map((unit) => unit.toBytes)).toEqual([1, 1000, 1000 ** 2, 1000 ** 3, 1000 ** 4, 1000 ** 5])
  })

  it('builds the binary system on powers of 1024', () => {
    expect(BINARY_UNITS.map((unit) => unit.toBytes)).toEqual([1024, 1024 ** 2, 1024 ** 3, 1024 ** 4, 1024 ** 5])
  })

  it('finds a unit by id, and reports nothing for one that does not exist', () => {
    expect(findUnit('MiB')?.label).toBe('Mebibytes')
    expect(findUnit('nope')).toBeUndefined()
  })
})

describe('toBytes / fromBytes', () => {
  it('converts a byte-multiple unit to bytes', () => {
    expect(toBytes(1, findUnit('KB')!)).toBe(1000)
    expect(toBytes(1, findUnit('KiB')!)).toBe(1024)
    expect(toBytes(1.5, findUnit('GB')!)).toBe(1.5 * 1000 ** 3)
  })

  it('converts bits to a fraction of a byte', () => {
    expect(toBytes(8, BIT_UNIT)).toBe(1)
    expect(toBytes(1, BIT_UNIT)).toBeCloseTo(0.125)
  })

  it('round-trips bytes back through a unit', () => {
    expect(fromBytes(1000, findUnit('KB')!)).toBe(1)
    expect(fromBytes(1024, findUnit('KiB')!)).toBe(1)
    expect(fromBytes(1, BIT_UNIT)).toBe(8)
  })

  it('demonstrates the decimal/binary gap a 1 TB drive is known for', () => {
    // A "1 TB" drive, read in GiB by an OS that reports binary units.
    const bytes = toBytes(1, findUnit('TB')!)
    const gib = fromBytes(bytes, findUnit('GiB')!)
    expect(gib).toBeCloseTo(931.32, 1)
  })

  it('treats bytes as its own base unit', () => {
    expect(toBytes(42, BYTE_UNIT)).toBe(42)
    expect(fromBytes(42, BYTE_UNIT)).toBe(42)
  })
})

describe('parseSize', () => {
  it('parses plain numbers, including decimals and signs', () => {
    expect(parseSize('42')).toBe(42)
    expect(parseSize('3.5')).toBe(3.5)
    expect(parseSize('-12')).toBe(-12)
    expect(parseSize('+7')).toBe(7)
  })

  it('accepts thousands commas and surrounding whitespace', () => {
    expect(parseSize('  1,234,567  ')).toBe(1234567)
  })

  it('returns null for empty input, distinct from a real zero', () => {
    expect(parseSize('')).toBeNull()
    expect(parseSize('   ')).toBeNull()
    expect(parseSize('0')).toBe(0)
  })

  it('returns null for text that is not a number', () => {
    expect(parseSize('abc')).toBeNull()
    expect(parseSize('12mb')).toBeNull()
    expect(parseSize('NaN')).toBeNull()
    expect(parseSize('Infinity')).toBeNull()
  })
})

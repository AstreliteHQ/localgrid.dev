import { describe, expect, it } from 'vitest'
import { formatCpuMillicores, formatMemoryBytes, parseCpuQuantity, parseMemoryQuantity } from './k8sQuantity'

describe('parseCpuQuantity', () => {
  it('parses a millicore string', () => {
    expect(parseCpuQuantity('500m')).toBe(500)
  })

  it('parses a whole-core string as cores × 1000', () => {
    expect(parseCpuQuantity('2')).toBe(2000)
  })

  it('parses a fractional-core string', () => {
    expect(parseCpuQuantity('0.5')).toBe(500)
  })

  it('parses a bare YAML number the same as its string form', () => {
    expect(parseCpuQuantity(2)).toBe(2000)
  })

  it('returns null for an empty or missing value', () => {
    expect(parseCpuQuantity('')).toBeNull()
    expect(parseCpuQuantity(undefined)).toBeNull()
    expect(parseCpuQuantity(null)).toBeNull()
  })

  it('returns null for unparseable text', () => {
    expect(parseCpuQuantity('abc')).toBeNull()
    expect(parseCpuQuantity('500Mi')).toBeNull()
  })

  it('parses a quoted leading-dot decimal, the same shape unquoted YAML already normalizes', () => {
    expect(parseCpuQuantity('.5')).toBe(500)
  })
})

describe('parseMemoryQuantity', () => {
  it('parses binary-unit suffixes', () => {
    expect(parseMemoryQuantity('128Mi')).toBe(128 * 2 ** 20)
    expect(parseMemoryQuantity('1Gi')).toBe(2 ** 30)
    expect(parseMemoryQuantity('1Ki')).toBe(1024)
  })

  it('parses decimal-unit suffixes', () => {
    expect(parseMemoryQuantity('500M')).toBe(500e6)
    expect(parseMemoryQuantity('2G')).toBe(2e9)
  })

  it('is lenient about an uppercase K, a common typo for the real lowercase k suffix', () => {
    expect(parseMemoryQuantity('500K')).toBe(500e3)
    expect(parseMemoryQuantity('500k')).toBe(500e3)
  })

  it('parses a fractional value with a suffix', () => {
    expect(parseMemoryQuantity('1.5Gi')).toBe(1.5 * 2 ** 30)
  })

  it('parses a plain number as bytes', () => {
    expect(parseMemoryQuantity('1000')).toBe(1000)
    expect(parseMemoryQuantity(1000)).toBe(1000)
  })

  it('returns null for an empty or missing value', () => {
    expect(parseMemoryQuantity('')).toBeNull()
    expect(parseMemoryQuantity(undefined)).toBeNull()
    expect(parseMemoryQuantity(null)).toBeNull()
  })

  it('returns null for unparseable text', () => {
    expect(parseMemoryQuantity('abc')).toBeNull()
    expect(parseMemoryQuantity('500Zi')).toBeNull()
  })

  it('parses a quoted leading-dot decimal', () => {
    expect(parseMemoryQuantity('.5Gi')).toBe(0.5 * 2 ** 30)
  })

  it('parses exponent notation, which a stringified huge byte count can come out as', () => {
    expect(parseMemoryQuantity('1e9')).toBe(1e9)
    expect(parseMemoryQuantity('1e+21')).toBe(1e21)
  })
})

describe('formatCpuMillicores', () => {
  it('formats zero as "0"', () => {
    expect(formatCpuMillicores(0)).toBe('0')
  })

  it('formats sub-core amounts with an m suffix', () => {
    expect(formatCpuMillicores(500)).toBe('500m')
    expect(formatCpuMillicores(250)).toBe('250m')
  })

  it('formats whole-core amounts as bare numbers', () => {
    expect(formatCpuMillicores(2000)).toBe('2')
    expect(formatCpuMillicores(1000)).toBe('1')
  })

  it('formats fractional-core amounts without trailing zeros', () => {
    expect(formatCpuMillicores(1500)).toBe('1.5')
    expect(formatCpuMillicores(1250)).toBe('1.25')
  })
})

describe('formatMemoryBytes', () => {
  it('formats zero as "0"', () => {
    expect(formatMemoryBytes(0)).toBe('0')
  })

  it('formats bytes below 1Ki as a bare number', () => {
    expect(formatMemoryBytes(500)).toBe('500')
  })

  it('picks the largest binary unit that keeps the value at least 1', () => {
    expect(formatMemoryBytes(2 ** 20)).toBe('1Mi')
    expect(formatMemoryBytes(2 ** 30)).toBe('1Gi')
  })

  it('formats fractional amounts without trailing zeros, rounded to 2 decimals', () => {
    expect(formatMemoryBytes(1.5 * 2 ** 30)).toBe('1.5Gi')
    expect(formatMemoryBytes(1.25 * 2 ** 20)).toBe('1.25Mi')
  })

  it('round-trips common requests/limits values written with a suffix', () => {
    expect(formatMemoryBytes(parseMemoryQuantity('256Mi') as number)).toBe('256Mi')
    expect(formatMemoryBytes(parseMemoryQuantity('1Gi') as number)).toBe('1Gi')
  })
})

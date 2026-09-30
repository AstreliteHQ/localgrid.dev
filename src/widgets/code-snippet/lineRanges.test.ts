import { describe, expect, it } from 'vitest'
import { parseLineNumbers } from './lineRanges'

describe('parseLineNumbers', () => {
  it('is empty for blank input', () => {
    expect(parseLineNumbers('')).toEqual(new Set())
    expect(parseLineNumbers('   ')).toEqual(new Set())
  })

  it('parses a mix of single lines and ranges', () => {
    expect(parseLineNumbers('2, 4-6, 9')).toEqual(new Set([2, 4, 5, 6, 9]))
  })

  it('tolerates extra whitespace and a trailing comma', () => {
    expect(parseLineNumbers(' 1 - 2 ,  4, ')).toEqual(new Set([1, 2, 4]))
  })

  it('de-duplicates overlapping lines and ranges', () => {
    expect(parseLineNumbers('2, 1-3, 3')).toEqual(new Set([1, 2, 3]))
  })

  it('silently skips a token that is not a line number or range, rather than erroring', () => {
    expect(parseLineNumbers('1, two, 3')).toEqual(new Set([1, 3]))
  })

  it('silently skips a range that starts after it ends', () => {
    expect(parseLineNumbers('5-2, 7')).toEqual(new Set([7]))
  })

  it('silently skips a non-positive line number', () => {
    expect(parseLineNumbers('0, -1, 3')).toEqual(new Set([3]))
  })
})

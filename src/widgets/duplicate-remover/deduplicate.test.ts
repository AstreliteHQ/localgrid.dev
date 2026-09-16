import { describe, expect, it } from 'vitest'
import { deduplicate, joinEntries, splitItems, topDuplicates, type DedupeOptions } from './deduplicate'

const BASE: DedupeOptions = { splitMode: 'lines', trim: true, ignoreCase: false, order: 'first-seen' }

function values(input: string, options: Partial<DedupeOptions> = {}): string[] {
  return deduplicate(input, { ...BASE, ...options }).entries.map((entry) => entry.value)
}

describe('splitItems', () => {
  it('splits on the chosen separator', () => {
    expect(splitItems('a\nb\nc', { splitMode: 'lines', trim: true })).toEqual(['a', 'b', 'c'])
    expect(splitItems('a,b,c', { splitMode: 'comma', trim: true })).toEqual(['a', 'b', 'c'])
    expect(splitItems('a b\tc', { splitMode: 'whitespace', trim: true })).toEqual(['a', 'b', 'c'])
  })

  it('handles CRLF line endings', () => {
    expect(splitItems('a\r\nb', { splitMode: 'lines', trim: true })).toEqual(['a', 'b'])
  })

  it('drops empty items, so blank lines and a trailing comma are not entries', () => {
    expect(splitItems('a\n\n\nb\n', { splitMode: 'lines', trim: true })).toEqual(['a', 'b'])
    expect(splitItems('a,b,', { splitMode: 'comma', trim: true })).toEqual(['a', 'b'])
  })

  it('keeps surrounding whitespace when trim is off', () => {
    expect(splitItems(' a \nb', { splitMode: 'lines', trim: false })).toEqual([' a ', 'b'])
  })
})

describe('deduplicate', () => {
  it('keeps the first occurrence of each value, in order', () => {
    expect(values('b\na\nb\nc\na')).toEqual(['b', 'a', 'c'])
  })

  it('counts every occurrence, including the first', () => {
    const result = deduplicate('a\nb\na\na', BASE)
    expect(result.entries).toEqual([
      { value: 'a', count: 3 },
      { value: 'b', count: 1 },
    ])
  })

  it('reports totals that add up', () => {
    const result = deduplicate('a\nb\na\nc\nb\na', BASE)
    expect(result.total).toBe(6)
    expect(result.uniqueCount).toBe(3)
    expect(result.removedCount).toBe(3)
    expect(result.duplicatedValues).toBe(2)
  })

  it('reports nothing for empty input', () => {
    const result = deduplicate('   \n\n', BASE)
    expect(result).toEqual({ entries: [], total: 0, uniqueCount: 0, removedCount: 0, duplicatedValues: 0 })
  })

  it('treats differently-cased items as distinct by default', () => {
    expect(values('Apple\napple\nAPPLE')).toEqual(['Apple', 'apple', 'APPLE'])
  })

  it('folds case when asked, keeping the first spelling seen', () => {
    const result = deduplicate('Apple\napple\nAPPLE', { ...BASE, ignoreCase: true })
    expect(result.entries).toEqual([{ value: 'Apple', count: 3 }])
  })

  it('only collapses whitespace-padded duplicates when trim is on', () => {
    expect(values(' a \na')).toEqual(['a'])
    expect(values(' a \na', { trim: false })).toEqual([' a ', 'a'])
  })

  it('sorts alphabetically with natural number ordering', () => {
    expect(values('item10\nitem2\nitem1\nitem2', { order: 'alphabetical' })).toEqual(['item1', 'item2', 'item10'])
  })

  it('sorts by count, keeping first-seen order between ties', () => {
    const result = deduplicate('b\na\nb\nc\na\nb', { ...BASE, order: 'frequency' })
    expect(result.entries).toEqual([
      { value: 'b', count: 3 },
      { value: 'a', count: 2 },
      { value: 'c', count: 1 },
    ])
  })

  it('reorders without changing the counts', () => {
    const first = deduplicate('b\na\nb', BASE)
    const sorted = deduplicate('b\na\nb', { ...BASE, order: 'alphabetical' })
    expect(sorted.total).toBe(first.total)
    expect(sorted.removedCount).toBe(first.removedCount)
    expect(sorted.entries.map((e) => e.count).reduce((a, b) => a + b)).toBe(first.total)
  })

  it('deduplicates a comma-separated list', () => {
    expect(values('a, b, a, c', { splitMode: 'comma' })).toEqual(['a', 'b', 'c'])
  })
})

describe('joinEntries', () => {
  it('rejoins with the separator the list was split on', () => {
    const entries = [
      { value: 'a', count: 2 },
      { value: 'b', count: 1 },
    ]
    expect(joinEntries(entries, 'lines')).toBe('a\nb')
    expect(joinEntries(entries, 'comma')).toBe('a, b')
    expect(joinEntries(entries, 'whitespace')).toBe('a b')
  })

  it('returns an empty string for no entries', () => {
    expect(joinEntries([], 'lines')).toBe('')
  })

  it('does not grow untrimmed comma values with an extra space', () => {
    // With trimming off, ' b' keeps the space that followed its comma, so
    // the separator must not add another one: round-tripping the result
    // has to give back the same list.
    const entries = deduplicate('a, b, b', { ...BASE, splitMode: 'comma', trim: false }).entries
    expect(entries.map((entry) => entry.value)).toEqual(['a', ' b'])
    const joined = joinEntries(entries, 'comma', false)
    expect(joined).toBe('a, b')
    expect(deduplicate(joined, { ...BASE, splitMode: 'comma', trim: false }).entries.map((e) => e.value)).toEqual([
      'a',
      ' b',
    ])
  })
})

describe('topDuplicates', () => {
  it('keeps only repeated values, most repeated first', () => {
    const result = deduplicate('a\nb\nb\nc\nc\nc', BASE)
    expect(topDuplicates(result.entries, 10)).toEqual([
      { value: 'c', count: 3 },
      { value: 'b', count: 2 },
    ])
  })

  it('caps the list without changing the counts behind it', () => {
    const input = Array.from({ length: 500 }, (_, index) => `item-${index}\nitem-${index}`).join('\n')
    const result = deduplicate(input, BASE)
    expect(result.duplicatedValues).toBe(500)
    expect(topDuplicates(result.entries, 200)).toHaveLength(200)
  })

  it('returns nothing when every item is unique', () => {
    expect(topDuplicates(deduplicate('a\nb\nc', BASE).entries, 10)).toEqual([])
  })
})

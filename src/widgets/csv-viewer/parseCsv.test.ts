import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from './parseCsv'

describe('parseCsv', () => {
  it('is empty for empty input', () => {
    expect(parseCsv('', ',')).toEqual([])
  })

  it('parses a simple comma-separated grid', () => {
    expect(parseCsv('a,b,c\n1,2,3', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('parses a single line with no trailing newline', () => {
    expect(parseCsv('a,b,c', ',')).toEqual([['a', 'b', 'c']])
  })

  it('does not add a phantom row for a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('splits on semicolon when given that delimiter', () => {
    expect(parseCsv('a;b;c\n1;2;3', ';')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('splits on tab when given that delimiter', () => {
    expect(parseCsv('a\tb\tc', '\t')).toEqual([['a', 'b', 'c']])
  })

  it('handles \\r\\n and lone \\r line endings the same as \\n', () => {
    expect(parseCsv('a,b\r\n1,2\r3,4', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('keeps a delimiter inside a quoted field as part of the value', () => {
    expect(parseCsv('name,note\nAda,"Lovelace, Ada"', ',')).toEqual([
      ['name', 'note'],
      ['Ada', 'Lovelace, Ada'],
    ])
  })

  it('keeps a newline inside a quoted field as part of the value', () => {
    expect(parseCsv('note\n"line one\nline two"', ',')).toEqual([['note'], ['line one\nline two']])
  })

  it('unescapes a doubled quote inside a quoted field to a single literal quote', () => {
    expect(parseCsv('quote\n"She said ""hi"""', ',')).toEqual([['quote'], ['She said "hi"']])
  })

  it('pads a ragged row to the width of the widest row', () => {
    expect(parseCsv('a,b,c\n1,2', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', ''],
    ])
  })

  it('treats a blank line as a single-cell empty row', () => {
    expect(parseCsv('a,b\n\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['', ''],
      ['1', '2'],
    ])
  })
})

describe('detectDelimiter', () => {
  it('detects a comma-delimited sample', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
  })

  it('detects a semicolon-delimited sample (e.g. a European-locale Excel export)', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
  })

  it('detects a tab-delimited sample', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })

  it('falls back to comma for text with no clear delimiter', () => {
    expect(detectDelimiter('just one column\nanother line')).toBe(',')
  })

  it('only samples the first few lines, not the whole file', () => {
    const manySemicolonLines = Array.from({ length: 50 }, () => 'a;b;c').join('\n')
    const text = `x,y\n${manySemicolonLines}`
    expect(detectDelimiter(text)).toBe(';')
  })
})

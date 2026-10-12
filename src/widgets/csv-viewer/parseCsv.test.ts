import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from './parseCsv'

function rowsOf(text: string, delimiter: string, maxRows?: number) {
  return parseCsv(text, delimiter, maxRows).rows
}

describe('parseCsv', () => {
  it('is empty for empty input', () => {
    expect(parseCsv('', ',')).toEqual({ rows: [], totalRows: 0 })
  })

  it('parses a simple comma-separated grid', () => {
    expect(rowsOf('a,b,c\n1,2,3', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('parses a single line with no trailing newline', () => {
    expect(rowsOf('a,b,c', ',')).toEqual([['a', 'b', 'c']])
  })

  it('does not add a phantom row for a trailing newline', () => {
    expect(rowsOf('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('splits on semicolon when given that delimiter', () => {
    expect(rowsOf('a;b;c\n1;2;3', ';')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('splits on tab when given that delimiter', () => {
    expect(rowsOf('a\tb\tc', '\t')).toEqual([['a', 'b', 'c']])
  })

  it('splits on a custom single-character delimiter', () => {
    expect(rowsOf('a|b|c\n1|2|3', '|')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles \\r\\n and lone \\r line endings the same as \\n', () => {
    expect(rowsOf('a,b\r\n1,2\r3,4', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('keeps a delimiter inside a quoted field as part of the value', () => {
    expect(rowsOf('name,note\nAda,"Lovelace, Ada"', ',')).toEqual([
      ['name', 'note'],
      ['Ada', 'Lovelace, Ada'],
    ])
  })

  it('keeps a newline inside a quoted field as part of the value', () => {
    expect(rowsOf('note\n"line one\nline two"', ',')).toEqual([['note'], ['line one\nline two']])
  })

  it('unescapes a doubled quote inside a quoted field to a single literal quote', () => {
    expect(rowsOf('quote\n"She said ""hi"""', ',')).toEqual([['quote'], ['She said "hi"']])
  })

  it('pads a ragged row to the width of the widest row', () => {
    expect(rowsOf('a,b,c\n1,2', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', ''],
    ])
  })

  it('treats a blank line as a single-cell empty row', () => {
    expect(rowsOf('a,b\n\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['', ''],
      ['1', '2'],
    ])
  })

  it('keeps a final row that is a single quoted empty field', () => {
    expect(rowsOf('a\n""', ',')).toEqual([['a'], ['']])
  })

  it('keeps a final row with a quoted empty field alongside other cells', () => {
    expect(rowsOf('a,b\n1,""', ',')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('caps the returned rows at maxRows but still counts every row', () => {
    const text = Array.from({ length: 10 }, (_, i) => `row${i}`).join('\n')
    const result = parseCsv(text, ',', 3)
    expect(result.rows).toEqual([['row0'], ['row1'], ['row2']])
    expect(result.totalRows).toBe(10)
  })

  it('reports an accurate totalRows when under the cap', () => {
    const result = parseCsv('a,b\n1,2', ',', 100)
    expect(result.rows).toHaveLength(2)
    expect(result.totalRows).toBe(2)
  })

  it('does not let a wide row past the cap widen the kept rows', () => {
    const result = parseCsv('a,b\nwide1,wide2,wide3', ',', 1)
    expect(result.rows).toEqual([['a', 'b']])
    expect(result.totalRows).toBe(2)
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

  it('ignores delimiter-like characters inside a quoted field', () => {
    expect(detectDelimiter('name;note\nAda;"one,two,three"')).toBe(';')
  })

  it('ignores a newline inside a quoted field when counting sample lines', () => {
    expect(detectDelimiter('name;note\nAda;"multi\nline"\nGrace;x')).toBe(';')
  })
})

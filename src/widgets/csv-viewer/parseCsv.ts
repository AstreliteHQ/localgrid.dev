/** Pure CSV/TSV parsing behind the CSV Viewer widget — no DOM, no widget
 * state, just delimited text in, a rectangular grid of cells out. */

export type CsvDelimiter = ',' | ';' | '\t'

const DELIMITER_CANDIDATES: CsvDelimiter[] = [',', ';', '\t']

function countOccurrences(line: string, char: string): number {
  let count = 0
  for (const c of line) if (c === char) count++
  return count
}

/** Picks whichever candidate delimiter appears most often across the first
 * few non-blank lines. A plain character count rather than a quote-aware
 * one — this only has to be a good guess for the "Auto" default, not
 * authoritative, and the widget always lets the delimiter be overridden by
 * hand. Ties favor comma, the most common case. */
export function detectDelimiter(text: string): CsvDelimiter {
  const sampleLines = text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.length > 0)
    .slice(0, 5)

  let best: CsvDelimiter = ','
  let bestCount = -1
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = sampleLines.reduce((sum, line) => sum + countOccurrences(line, candidate), 0)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** Parses CSV/TSV text into rows of string cells, honoring RFC 4180
 * quoting: a field wrapped in double quotes can contain the delimiter,
 * newlines, and a literal double quote written as two in a row (""). Every
 * row is padded to the width of the widest row, so a ragged file (a
 * trailing row with fewer fields, say) still comes out as a rectangular
 * grid rather than a table that falls over. */
export function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }
  // Flushes whatever the loop was still building — unless it's nothing at
  // all, which only happens when the text ended right after a line break
  // and would otherwise add a phantom empty row for it.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
  return rows.map((r) => (r.length < width ? [...r, ...new Array(width - r.length).fill('')] : r))
}

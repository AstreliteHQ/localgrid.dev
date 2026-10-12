/** Pure CSV/TSV parsing behind the CSV Viewer widget — no DOM, no widget
 * state, just delimited text in, a rectangular grid of cells out. */

export type CsvDelimiter = ',' | ';' | '\t'

const DELIMITER_CANDIDATES: CsvDelimiter[] = [',', ';', '\t']

/** Picks whichever candidate delimiter appears most often across the first
 * few non-blank lines, ignoring anything inside a quoted field (so a quoted
 * `"one,two,three"` can't make comma look more common than the real
 * delimiter). A plain character count rather than a full parse — this only
 * has to be a good guess for the "Auto" default, not authoritative, and the
 * widget always lets the delimiter be overridden by hand. Ties favor comma,
 * the most common case. */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 }
  const SAMPLE_LINES = 5
  let inQuotes = false
  let lineHasContent = false
  let sampledLines = 0
  let i = 0
  const n = text.length

  while (i < n && sampledLines < SAMPLE_LINES) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      lineHasContent = true
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      lineHasContent = true
      i++
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      if (lineHasContent) sampledLines++
      lineHasContent = false
      i++
      continue
    }
    if (char === ',' || char === ';' || char === '\t') counts[char]++
    lineHasContent = true
    i++
  }

  let best: CsvDelimiter = ','
  let bestCount = -1
  for (const candidate of DELIMITER_CANDIDATES) {
    if (counts[candidate] > bestCount) {
      best = candidate
      bestCount = counts[candidate]
    }
  }
  return best
}

export interface ParseCsvResult {
  /** The parsed grid, capped at `maxRows` rows (padded to a rectangular
   * shape within that cap). */
  rows: string[][]
  /** The true number of rows in the input, even when `rows` was capped —
   * lets the widget show an accurate "N rows" count and truncation notice
   * without having to keep every row's cells in memory. */
  totalRows: number
}

/** Parses CSV/TSV text into rows of string cells, honoring RFC 4180
 * quoting: a field wrapped in double quotes can contain the delimiter,
 * newlines, and a literal double quote written as two in a row (""). Every
 * kept row is padded to the width of the widest kept row, so a ragged file
 * (a trailing row with fewer fields, say) still comes out as a rectangular
 * grid rather than a table that falls over.
 *
 * `maxRows` bounds how many rows are actually built and kept (default:
 * unbounded). Scanning still covers the whole input, so `totalRows` is
 * always accurate, but once the cap is reached no further field strings or
 * row arrays are allocated — a huge paste that will only ever render its
 * first 1,000 rows doesn't pay to materialize the rest. */
export function parseCsv(text: string, delimiter: string, maxRows = Infinity): ParseCsvResult {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let totalRows = 0
  let i = 0
  const n = text.length

  const keep = () => rows.length < maxRows
  // Whether anything (a delimiter, a quote, a character) has been seen for
  // the row currently in progress — tracked independently of `keep()` so a
  // final, unterminated row past the cap still gets counted into
  // `totalRows` even though its cells are never built or retained.
  let rowHasData = false

  while (i < n) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          if (keep()) field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      if (keep()) field += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      rowHasData = true
      i++
      continue
    }
    if (char === delimiter) {
      if (keep()) row.push(field)
      field = ''
      rowHasData = true
      i++
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      if (keep()) {
        row.push(field)
        rows.push(row)
        row = []
      }
      field = ''
      rowHasData = false
      totalRows++
      i++
      continue
    }
    if (keep()) field += char
    rowHasData = true
    i++
  }
  // Flushes whatever the loop was still building — unless it's nothing at
  // all, which only happens when the text ended right after a line break
  // and would otherwise add a phantom empty row for it. `rowHasData` (not
  // `field !== '' || row.length > 0`) is what decides this, since a quoted
  // empty field (`""`) leaves both of those empty too, and a row past the
  // cap never builds `field`/`row` at all.
  if (rowHasData) {
    if (keep()) {
      row.push(field)
      rows.push(row)
    }
    totalRows++
  }

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const paddedRows = rows.map((r) => (r.length < width ? [...r, ...new Array(width - r.length).fill('')] : r))
  return { rows: paddedRows, totalRows }
}

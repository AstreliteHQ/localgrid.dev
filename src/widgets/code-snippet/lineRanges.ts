/** Parses a user-typed line list like `"2, 4-6"` into a set of 1-based line
 * numbers, for the Code Snippet widget's highlight/blur line options.
 *
 * Deliberately lenient rather than validated like Split PDF's page ranges:
 * this is a cosmetic overlay, not a destructive operation, so a stray typo
 * should just have no visible effect on that one token instead of blocking
 * the whole render with an error. */

const RANGE_TOKEN = /^(\d+)(?:-(\d+))?$/

export function parseLineNumbers(input: string): Set<number> {
  const lines = new Set<number>()
  for (const rawToken of input.split(',')) {
    const token = rawToken.trim().replace(/\s+/g, '')
    if (!token) continue
    const match = RANGE_TOKEN.exec(token)
    if (!match) continue
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : start
    if (start < 1 || end < start) continue
    for (let line = start; line <= end; line++) lines.add(line)
  }
  return lines
}

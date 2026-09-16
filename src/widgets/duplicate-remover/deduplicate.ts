/** Pure list-deduplication engine behind the Duplicate Remover widget.
 *
 * One pass over the items builds a Map keyed on each item's normalized
 * form, holding the first spelling seen and how many times it occurred. The
 * Map is what makes the whole thing linear: deduplicating and counting the
 * duplicates are the same walk, so the per-item counts the widget shows
 * cost nothing beyond the deduplication itself. What does not scale is
 * *rendering* one row per duplicated value, so the summary is capped by
 * `topDuplicates` rather than by refusing to count. */

export type SplitMode = 'lines' | 'comma' | 'whitespace'
export type OutputOrder = 'first-seen' | 'alphabetical' | 'frequency'

export interface DedupeOptions {
  splitMode: SplitMode
  /** Strips surrounding whitespace from each item before comparing it. */
  trim: boolean
  /** Compares case-insensitively; the first spelling seen is the one kept. */
  ignoreCase: boolean
  order: OutputOrder
}

export interface UniqueEntry {
  /** The first spelling encountered for this value. */
  value: string
  /** How many times it occurred in the input, including the first. */
  count: number
}

export interface DedupeResult {
  /** Unique values in the requested order, each with its occurrence count. */
  entries: UniqueEntry[]
  /** Items read from the input (empty ones excluded). */
  total: number
  uniqueCount: number
  /** Items dropped, i.e. `total - uniqueCount`. */
  removedCount: number
  /** Distinct values that occurred more than once. */
  duplicatedValues: number
}

const SEPARATORS: Record<SplitMode, RegExp> = {
  lines: /\r?\n/,
  comma: /,/,
  whitespace: /\s+/,
}

/** What the unique values are joined back together with. Deliberately the
 * same shape the input was split on, so a comma list stays a comma list
 * rather than turning into something the caller has to reformat. */
const JOINERS: Record<SplitMode, string> = {
  lines: '\n',
  comma: ', ',
  whitespace: ' ',
}

/** Splits raw text into items. Empty items are always dropped: a blank line
 * or a trailing comma is punctuation, not a list entry, and keeping it
 * would report a phantom duplicate on every extra blank line. */
export function splitItems(input: string, options: Pick<DedupeOptions, 'splitMode' | 'trim'>): string[] {
  const items: string[] = []
  for (const raw of input.split(SEPARATORS[options.splitMode])) {
    const item = options.trim ? raw.trim() : raw
    if (item !== '') items.push(item)
  }
  return items
}

function compareAlphabetically(a: UniqueEntry, b: UniqueEntry): number {
  // `numeric` so item2 sorts before item10, which is what anyone
  // deduplicating a list of ids or hostnames expects to see.
  return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'variant' })
}

/** Deduplicates `input` and counts every value's occurrences in the same
 * pass. Linear in the number of items; memory is proportional to the number
 * of *distinct* values, which deduplication requires either way. */
export function deduplicate(input: string, options: DedupeOptions): DedupeResult {
  const items = splitItems(input, options)
  const seen = new Map<string, UniqueEntry>()

  for (const item of items) {
    const key = options.ignoreCase ? item.toLowerCase() : item
    const existing = seen.get(key)
    if (existing) existing.count += 1
    else seen.set(key, { value: item, count: 1 })
  }

  // Map iteration order is insertion order, so this is already "first
  // seen"; the other orders sort a copy of it.
  const firstSeen = [...seen.values()]
  let entries = firstSeen
  if (options.order === 'alphabetical') {
    entries = [...firstSeen].sort(compareAlphabetically)
  } else if (options.order === 'frequency') {
    // Array.prototype.sort is stable, so equal counts stay in first-seen
    // order instead of shuffling as you type.
    entries = [...firstSeen].sort((a, b) => b.count - a.count)
  }

  let duplicatedValues = 0
  for (const entry of firstSeen) {
    if (entry.count > 1) duplicatedValues += 1
  }

  return {
    entries,
    total: items.length,
    uniqueCount: entries.length,
    removedCount: items.length - entries.length,
    duplicatedValues,
  }
}

/** Joins unique values back into text using the separator they were split
 * on. Kept out of `deduplicate` so a caller that only needs the counts
 * never pays for building a string the size of its input.
 *
 * `trim` matters for comma mode only: with trimming off, the items still
 * carry the spaces that followed each comma, so adding the usual `', '`
 * would hand back a list whose values have grown a space, and feeding that
 * result back in would grow them again. */
export function joinEntries(entries: UniqueEntry[], splitMode: SplitMode, trim = true): string {
  const separator = splitMode === 'comma' && !trim ? ',' : JOINERS[splitMode]
  return entries.map((entry) => entry.value).join(separator)
}

/** The most-repeated values first, capped at `limit`. The cap is a
 * rendering budget, not a counting one: every duplicate is already counted
 * by `deduplicate`, but a list with 200k distinct repeated values would
 * mean 200k DOM rows, which is what actually makes a big paste feel
 * broken. */
export function topDuplicates(entries: UniqueEntry[], limit: number): UniqueEntry[] {
  const duplicates = entries.filter((entry) => entry.count > 1)
  // Stable sort again: equal counts keep whatever order `entries` is in,
  // so the summary follows the output order the user picked.
  duplicates.sort((a, b) => b.count - a.count)
  return duplicates.slice(0, limit)
}

import { parseAllDocuments } from 'yaml'

export type DocumentFormat = 'json' | 'yaml'

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string } | { ok: false; error: null }

/** A YAML alias can point at one of its own ancestors (`a: &x { b: *x }`),
 * which `toJS` turns into a cyclic object the diff would recurse into
 * forever. Only the current ancestor chain is tracked, so the same anchor
 * reused in two places (shared, not cyclic) is fine. */
function isCyclic(value: unknown, ancestors = new Set<object>()): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (ancestors.has(value)) return true
  ancestors.add(value)
  const children = Array.isArray(value) ? value : Object.values(value)
  const cyclic = children.some((child) => isCyclic(child, ancestors))
  ancestors.delete(value)
  return cyclic
}

/** Parses one side of the diff. YAML is a superset of JSON, so YAML mode
 * also takes JSON input, which lets a YAML manifest be compared against
 * its JSON form. A YAML stream with several `---` documents is compared as
 * a list of documents (the shape of a multi-resource Kubernetes file). An
 * empty input is `{ ok: false, error: null }`: nothing to diff, but not an
 * error worth showing either. */
export function parseDocument(input: string, format: DocumentFormat): ParseResult {
  if (!input.trim()) return { ok: false, error: null }
  try {
    if (format === 'json') return { ok: true, value: JSON.parse(input) as unknown }
    const docs = parseAllDocuments(input)
    for (const doc of docs) {
      if (doc.errors.length > 0) return { ok: false, error: doc.errors[0].message }
    }
    const values = docs.map((doc) => doc.toJS() as unknown)
    if (values.some((value) => isCyclic(value))) {
      return { ok: false, error: 'An alias refers to one of its own parents, so the document never ends' }
    }
    // A stream holding only comments has no documents at all.
    if (values.length === 0) return { ok: true, value: null }
    return { ok: true, value: values.length === 1 ? values[0] : values }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid input' }
  }
}

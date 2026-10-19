import { parseAllDocuments } from 'yaml'

export type DocumentFormat = 'json' | 'yaml'

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string } | { ok: false; error: null }

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
    // A stream holding only comments has no documents at all.
    if (values.length === 0) return { ok: true, value: null }
    return { ok: true, value: values.length === 1 ? values[0] : values }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid input' }
  }
}

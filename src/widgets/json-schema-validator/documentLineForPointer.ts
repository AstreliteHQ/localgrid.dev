/** Maps a JSON Pointer (the shape ajv's `instancePath` comes in) back to a
 * 1-based line number in the original source text it was parsed from.
 *
 * `yaml` parses JSON text too (JSON is valid YAML), and keeps a character
 * range on every node of the tree it builds either way — unlike
 * `JSON.parse`/`yaml`'s own `parse()`, which only hand back the plain JS
 * value, with no memory of where in the text each part of it came from. So
 * rather than writing a second parser just to track positions, this reuses
 * `yaml` for both document formats and only uses its own node tree, never
 * the resolved value.
 *
 * Parsing and the newline scan are both done once, in `parseDocumentIndex`,
 * and `lineForPointer` is cheap to call per issue on top of that — with
 * `allErrors: true`, ajv can report one error per invalid array entry, and
 * redoing either of those per issue would make a document with hundreds of
 * them stall live validation. */

import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

export interface DocumentIndex {
  root: unknown
  /** Offset of every `\n` in the source text, ascending — binary-searched
   * by `lineForPointer` rather than rescanned from the start each time. */
  newlineOffsets: number[]
}

function pointerSegments(pointer: string): string[] {
  if (!pointer || pointer === '/') return []
  const raw = pointer.startsWith('/') ? pointer.slice(1) : pointer
  return raw.split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function resolveNode(root: unknown, segments: string[]): unknown {
  let node = root
  for (const segment of segments) {
    if (isSeq(node)) {
      const index = Number(segment)
      node = Number.isInteger(index) ? node.items[index] : undefined
    } else if (isMap(node)) {
      const pair = node.items.find((item) => isScalar(item.key) && String(item.key.value) === segment)
      node = pair?.value
    } else {
      return undefined
    }
    if (node === undefined) return undefined
  }
  return node
}

/** `null` when `documentText` doesn't parse — callers should treat that the
 * same as every `lineForPointer` call on it returning `null`. */
export function parseDocumentIndex(documentText: string): DocumentIndex | null {
  let doc
  try {
    doc = parseDocument(documentText)
  } catch {
    return null
  }
  if (doc.errors.length > 0) return null

  const newlineOffsets: number[] = []
  for (let i = 0; i < documentText.length; i++) {
    if (documentText[i] === '\n') newlineOffsets.push(i)
  }
  return { root: doc.contents, newlineOffsets }
}

/** `null` when `pointer` doesn't resolve to an actual node in `index` —
 * can happen for a handful of ajv error kinds whose `instancePath` outruns
 * what's actually written in the document. */
export function lineForPointer(index: DocumentIndex, pointer: string): number | null {
  const node = resolveNode(index.root, pointerSegments(pointer))
  const offset = (node as { range?: readonly [number, number, number] } | undefined)?.range?.[0]
  if (offset == null) return null

  // First newline offset that is >= offset — its index is the count of
  // newlines strictly before `offset`, i.e. the 0-based line number.
  const { newlineOffsets } = index
  let lo = 0
  let hi = newlineOffsets.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (newlineOffsets[mid] < offset) lo = mid + 1
    else hi = mid
  }
  return lo + 1
}

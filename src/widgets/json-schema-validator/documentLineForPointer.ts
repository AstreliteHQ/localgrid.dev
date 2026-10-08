/** Maps a JSON Pointer (the shape ajv's `instancePath` comes in) back to a
 * 1-based line number in the original source text it was parsed from.
 *
 * `yaml` parses JSON text too (JSON is valid YAML), and keeps a character
 * range on every node of the tree it builds either way — unlike
 * `JSON.parse`/`yaml`'s own `parse()`, which only hand back the plain JS
 * value, with no memory of where in the text each part of it came from. So
 * rather than writing a second parser just to track positions, this reuses
 * `yaml` for both document formats and only uses its own node tree, never
 * the resolved value. */

import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

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

/** `null` when the document doesn't parse, or `pointer` doesn't resolve to
 * an actual node — the latter can happen for a handful of ajv error kinds
 * whose `instancePath` outruns what's actually written in the document. */
export function documentLineForPointer(documentText: string, pointer: string): number | null {
  let doc
  try {
    doc = parseDocument(documentText)
  } catch {
    return null
  }
  if (doc.errors.length > 0) return null

  const node = resolveNode(doc.contents, pointerSegments(pointer))
  const offset = (node as { range?: readonly [number, number, number] } | undefined)?.range?.[0]
  if (offset == null) return null

  // Newlines before `offset`, 1-based like every editor numbers its lines.
  let line = 1
  for (let i = 0; i < offset; i++) {
    if (documentText[i] === '\n') line++
  }
  return line
}

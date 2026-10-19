/** What happened to a node between the two documents. `nested` is a
 * container present on both sides with at least one change somewhere
 * inside it; a container with nothing changed inside is `unchanged`. */
export type DiffKind = 'unchanged' | 'added' | 'removed' | 'changed' | 'nested'

export interface DiffCounts {
  added: number
  removed: number
  changed: number
}

export interface DiffNode {
  /** Unique within the tree. Paths alone can collide in an array (an item
   * removed at `[2]` and another added at `[2]`), so the kind is folded in. */
  id: string
  /** Object key or array index; `null` for the root. */
  key: string | number | null
  /** JSONPath of the node, on the side it exists on (the changed side for
   * paired array items). */
  path: string
  kind: DiffKind
  before?: unknown
  after?: unknown
  /** Set when the node is a container: both sides for `unchanged`/`nested`,
   * the one existing side for `added`/`removed`. Empty for leaves and for
   * `changed` (a type change is shown as a whole value swap). */
  children: DiffNode[]
  counts: DiffCounts
}

export interface DiffOptions {
  /** Match array items by value regardless of position. */
  ignoreArrayOrder?: boolean
}

export interface DiffChange {
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

/** LCS alignment is quadratic. Above this many cells the arrays are
 * compared position by position instead, which stays linear. */
const MAX_LCS_CELLS = 1_000_000

const ZERO: DiffCounts = { added: 0, removed: 0, changed: 0 }

type Container = Record<string, unknown> | unknown[]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null
}

/** Deep equality that ignores object key order, which is the whole point
 * of diffing structure instead of text. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  }
  return Number.isNaN(a) && Number.isNaN(b)
}

/** Same notation as the data tree's paths: dot for identifiers, quoted
 * brackets for anything else, so a copied path stays valid. */
function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`
}

function sum(nodes: DiffNode[]): DiffCounts {
  const total = { ...ZERO }
  for (const node of nodes) {
    total.added += node.counts.added
    total.removed += node.counts.removed
    total.changed += node.counts.changed
  }
  return total
}

function entriesOf(value: Container): [string | number, unknown][] {
  return Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value)
}

/** A whole subtree that exists on one side only. Counts as one change at
 * its root, however much it holds. */
function oneSided(kind: 'added' | 'removed', key: string | number | null, path: string, value: unknown): DiffNode {
  const children = isContainer(value)
    ? entriesOf(value).map(([childKey, item]) => {
        const child = oneSided(kind, childKey, childPath(path, childKey), item)
        child.counts = { ...ZERO }
        return child
      })
    : []
  return {
    id: `${path}#${kind}`,
    key,
    path,
    kind,
    [kind === 'added' ? 'after' : 'before']: value,
    children,
    counts: { ...ZERO, [kind]: 1 },
  }
}

function unchanged(key: string | number | null, path: string, value: unknown): DiffNode {
  return {
    id: `${path}#unchanged`,
    key,
    path,
    kind: 'unchanged',
    before: value,
    after: value,
    children: isContainer(value)
      ? entriesOf(value).map(([childKey, item]) => unchanged(childKey, childPath(path, childKey), item))
      : [],
    counts: { ...ZERO },
  }
}

function withChildren(
  key: string | number | null,
  path: string,
  before: unknown,
  after: unknown,
  children: DiffNode[],
): DiffNode {
  const counts = sum(children)
  const dirty = counts.added + counts.removed + counts.changed > 0
  return {
    id: `${path}#${dirty ? 'nested' : 'unchanged'}`,
    key,
    path,
    kind: dirty ? 'nested' : 'unchanged',
    before,
    after,
    children,
    counts,
  }
}

function diffObjects(
  key: string | number | null,
  path: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options: DiffOptions,
): DiffNode {
  const children: DiffNode[] = []
  // Keys in the changed document's order, then keys only the original had,
  // so the tree reads like the newer document.
  for (const [childKey, value] of Object.entries(after)) {
    const p = childPath(path, childKey)
    children.push(
      Object.hasOwn(before, childKey)
        ? diffValues(childKey, p, before[childKey], value, options)
        : oneSided('added', childKey, p, value),
    )
  }
  for (const [childKey, value] of Object.entries(before)) {
    if (!Object.hasOwn(after, childKey)) children.push(oneSided('removed', childKey, childPath(path, childKey), value))
  }
  return withChildren(key, path, before, after, children)
}

/** Index pairs `[beforeIndex, afterIndex]` of a longest common subsequence
 * of deeply equal items. */
function lcsPairs(before: unknown[], after: unknown[]): [number, number][] {
  const n = before.length
  const m = after.length
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = deepEqual(before[i], after[j])
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (deepEqual(before[i], after[j])) {
      pairs.push([i, j])
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return pairs
}

/** Ordered alignment: equal items are anchored by LCS, so inserting one
 * item at the top shows one addition instead of every item shifting. The
 * unmatched items between two anchors are paired up position by position
 * and diffed recursively (an edited object in a list stays one edit), and
 * whatever is left over is a plain addition or removal. */
function diffArraysOrdered(path: string, before: unknown[], after: unknown[], options: DiffOptions): DiffNode[] {
  const anchors =
    before.length * after.length > MAX_LCS_CELLS
      ? Array.from({ length: Math.min(before.length, after.length) }, (_, i) => [i, i] as [number, number]).filter(
          ([i, j]) => deepEqual(before[i], after[j]),
        )
      : lcsPairs(before, after)
  anchors.push([before.length, after.length])

  const children: DiffNode[] = []
  let i = 0
  let j = 0
  for (const [anchorI, anchorJ] of anchors) {
    const gap = Math.min(anchorI - i, anchorJ - j)
    for (let k = 0; k < gap; k++) {
      children.push(diffValues(j + k, childPath(path, j + k), before[i + k], after[j + k], options))
    }
    for (let k = i + gap; k < anchorI; k++) children.push(oneSided('removed', k, childPath(path, k), before[k]))
    for (let k = j + gap; k < anchorJ; k++) children.push(oneSided('added', k, childPath(path, k), after[k]))
    if (anchorI < before.length) children.push(unchanged(anchorJ, childPath(path, anchorJ), after[anchorJ]))
    i = anchorI + 1
    j = anchorJ + 1
  }
  return children
}

/** Unordered alignment: arrays are treated as multisets. Each item is
 * matched to an equal, not yet matched item on the other side; anything
 * left over was added or removed. */
function diffArraysUnordered(path: string, before: unknown[], after: unknown[]): DiffNode[] {
  const used = new Array<boolean>(before.length).fill(false)
  const children: DiffNode[] = []
  after.forEach((item, j) => {
    const i = before.findIndex((candidate, index) => !used[index] && deepEqual(candidate, item))
    if (i === -1) {
      children.push(oneSided('added', j, childPath(path, j), item))
    } else {
      used[i] = true
      children.push(unchanged(j, childPath(path, j), item))
    }
  })
  before.forEach((item, i) => {
    if (!used[i]) children.push(oneSided('removed', i, childPath(path, i), item))
  })
  return children
}

function diffValues(
  key: string | number | null,
  path: string,
  before: unknown,
  after: unknown,
  options: DiffOptions,
): DiffNode {
  if (Array.isArray(before) && Array.isArray(after)) {
    const children = options.ignoreArrayOrder
      ? diffArraysUnordered(path, before, after)
      : diffArraysOrdered(path, before, after, options)
    return withChildren(key, path, before, after, children)
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    return diffObjects(key, path, before, after, options)
  }
  if (deepEqual(before, after)) return unchanged(key, path, after)
  return {
    id: `${path}#changed`,
    key,
    path,
    kind: 'changed',
    before,
    after,
    children: [],
    counts: { ...ZERO, changed: 1 },
  }
}

/** Structural diff of two parsed documents. */
export function diffDocuments(before: unknown, after: unknown, options: DiffOptions = {}): DiffNode {
  return diffValues(null, '$', before, after, options)
}

/** The changes as a flat list, top-most first: an added or removed subtree
 * is one entry, not one per value inside it. */
export function flattenChanges(root: DiffNode): DiffChange[] {
  const changes: DiffChange[] = []
  const walk = (node: DiffNode) => {
    if (node.kind === 'added' || node.kind === 'removed' || node.kind === 'changed') {
      changes.push({ path: node.path, kind: node.kind, before: node.before, after: node.after })
    } else if (node.kind === 'nested') {
      node.children.forEach(walk)
    }
  }
  walk(root)
  return changes
}

export function formatValue(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

/** One line per change, prefixed like a unified diff, for copying. */
export function changesToText(changes: DiffChange[]): string {
  return changes
    .map((change) => {
      if (change.kind === 'added') return `+ ${change.path}: ${formatValue(change.after)}`
      if (change.kind === 'removed') return `- ${change.path}: ${formatValue(change.before)}`
      return `~ ${change.path}: ${formatValue(change.before)} → ${formatValue(change.after)}`
    })
    .join('\n')
}

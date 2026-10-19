import { describe, expect, it } from 'vitest'
import { changesToText, deepEqual, diffDocuments, flattenChanges } from './structuralDiff'

const changesOf = (before: unknown, after: unknown, ignoreArrayOrder = false) =>
  flattenChanges(diffDocuments(before, after, { ignoreArrayOrder }))

describe('deepEqual', () => {
  it('ignores object key order', () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true)
  })

  it('tells arrays and objects apart', () => {
    expect(deepEqual([], {})).toBe(false)
    expect(deepEqual({ 0: 'a' }, ['a'])).toBe(false)
  })

  it('treats an extra key as a difference', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: null })).toBe(false)
  })
})

describe('diffDocuments', () => {
  it('reports nothing for documents that only differ in key order', () => {
    const root = diffDocuments({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })
    expect(root.kind).toBe('unchanged')
    expect(flattenChanges(root)).toEqual([])
  })

  it('reports added, removed and changed keys by path, in the changed document order', () => {
    expect(changesOf({ a: 1, b: 2, nested: { x: 'old' } }, { a: 1, c: 3, nested: { x: 'new' } })).toEqual([
      { path: '$.c', kind: 'added', after: 3 },
      { path: '$.nested.x', kind: 'changed', before: 'old', after: 'new' },
      { path: '$.b', kind: 'removed', before: 2 },
    ])
  })

  it('quotes keys that are not identifiers', () => {
    expect(changesOf({ 'my key': 1 }, { 'my key': 2 })[0].path).toBe('$["my key"]')
  })

  it('reports a type change as one change, not a subtree of additions', () => {
    expect(changesOf({ a: [1] }, { a: { 0: 1 } })).toEqual([
      { path: '$.a', kind: 'changed', before: [1], after: { 0: 1 } },
    ])
  })

  it('counts an added subtree once', () => {
    const root = diffDocuments({}, { meta: { a: 1, b: 2 } })
    expect(root.counts).toEqual({ added: 1, removed: 0, changed: 0 })
    expect(root.children[0].children.map((child) => child.kind)).toEqual(['added', 'added'])
  })

  it('aligns arrays so one insertion at the top is one addition', () => {
    expect(changesOf(['b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toEqual([{ path: '$[0]', kind: 'added', after: 'a' }])
  })

  it('pairs an edited array item with its old version and diffs inside it', () => {
    expect(
      changesOf(
        [{ name: 'web', image: 'nginx:1.27' }, { name: 'db' }],
        [{ name: 'web', image: 'nginx:1.29' }, { name: 'db' }],
      ),
    ).toEqual([{ path: '$[0].image', kind: 'changed', before: 'nginx:1.27', after: 'nginx:1.29' }])
  })

  it('reports trailing array items as removed at their original index', () => {
    expect(changesOf([1, 2, 3], [1])).toEqual([
      { path: '$[1]', kind: 'removed', before: 2 },
      { path: '$[2]', kind: 'removed', before: 3 },
    ])
  })

  it('treats a reordered array as a change unless array order is ignored', () => {
    expect(changesOf([1, 2, 3], [3, 1, 2])).not.toEqual([])
    expect(changesOf([1, 2, 3], [3, 1, 2], true)).toEqual([])
  })

  it('matches duplicate items one to one when array order is ignored', () => {
    expect(changesOf(['a', 'a', 'b'], ['b', 'a'], true)).toEqual([{ path: '$[1]', kind: 'removed', before: 'a' }])
  })

  it('compares scalar roots', () => {
    expect(changesOf(1, 2)).toEqual([{ path: '$', kind: 'changed', before: 1, after: 2 }])
    expect(changesOf('same', 'same')).toEqual([])
  })

  it.each([
    ['positional edits', [1, { a: 2 }, 3], [4, { a: 5 }, 6, 7]],
    // A paired item and a removed one both end up at `$[1]`, and both have
    // a removed `k` below them.
    ['a paired item sharing a path with a removed one', [{ k: 1 }, { k: 1 }, 'X', { k: 1 }], ['X', {}]],
  ])('gives every node in the tree a unique id (%s)', (_, before, after) => {
    const root = diffDocuments(before, after)
    const ids: string[] = []
    const walk = (node: typeof root) => {
      ids.push(node.id)
      node.children.forEach(walk)
    }
    walk(root)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('changesToText', () => {
  it('writes one prefixed line per change', () => {
    expect(changesToText(changesOf({ a: 1, b: 'x' }, { a: 2, c: true }))).toBe(
      ['~ $.a: 1 → 2', '+ $.c: true', '- $.b: "x"'].join('\n'),
    )
  })
})

import { describe, expect, it } from 'vitest'
import { addRefs, countRemaining, createTodoItem, moveItem, type TodoItem } from './todoItem'

function item(id: string, done = false, refs: string[] = []): TodoItem {
  return { id, text: id, done, refs }
}

describe('createTodoItem', () => {
  it('creates an undone item from trimmed text, with no refs', () => {
    expect(createTodoItem('a1', '  Buy milk  ')).toEqual({ id: 'a1', text: 'Buy milk', done: false, refs: [] })
  })

  it('moves URLs from the text into refs', () => {
    expect(createTodoItem('a1', 'Review https://github.com/o/r/pull/4')).toEqual({
      id: 'a1',
      text: 'Review',
      done: false,
      refs: ['https://github.com/o/r/pull/4'],
    })
  })

  it('names an item made only of a link after that link', () => {
    expect(createTodoItem('a1', 'https://github.com/o/r/pull/4')?.text).toBe('PR #4')
  })

  it('returns null for empty or whitespace-only text', () => {
    expect(createTodoItem('a1', '')).toBeNull()
    expect(createTodoItem('a1', '   ')).toBeNull()
  })
})

describe('countRemaining', () => {
  it('counts items that are not done', () => {
    expect(countRemaining([item('1'), item('2', true), item('3')])).toBe(2)
  })

  it('returns 0 for an empty list or an all-done list', () => {
    expect(countRemaining([])).toBe(0)
    expect(countRemaining([item('1', true)])).toBe(0)
  })
})

describe('addRefs', () => {
  it('appends trimmed refs, skipping blanks and duplicates', () => {
    expect(addRefs(item('1', false, ['A-1']), [' B-2 ', '', 'A-1', 'B-2']).refs).toEqual(['A-1', 'B-2'])
  })

  it('returns the same item when nothing is added', () => {
    const original = item('1', false, ['A-1'])
    expect(addRefs(original, ['A-1', ' '])).toBe(original)
  })
})

describe('moveItem', () => {
  const items = [item('a'), item('b'), item('c')]
  const ids = (list: TodoItem[]) => list.map((entry) => entry.id)

  it('moves an item down or up', () => {
    expect(ids(moveItem(items, 'a', 2))).toEqual(['b', 'c', 'a'])
    expect(ids(moveItem(items, 'c', 0))).toEqual(['c', 'a', 'b'])
  })

  it('clamps the target index', () => {
    expect(ids(moveItem(items, 'b', 10))).toEqual(['a', 'c', 'b'])
    expect(ids(moveItem(items, 'b', -3))).toEqual(['b', 'a', 'c'])
  })

  it('returns the same list for an unknown id or no move', () => {
    expect(moveItem(items, 'z', 0)).toBe(items)
    expect(moveItem(items, 'b', 1)).toBe(items)
  })
})

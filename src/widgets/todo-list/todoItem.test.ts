import { describe, expect, it } from 'vitest'
import { countRemaining, createTodoItem } from './todoItem'

describe('createTodoItem', () => {
  it('creates an undone item from trimmed text', () => {
    expect(createTodoItem('a1', '  Buy milk  ')).toEqual({ id: 'a1', text: 'Buy milk', done: false })
  })

  it('returns null for empty or whitespace-only text', () => {
    expect(createTodoItem('a1', '')).toBeNull()
    expect(createTodoItem('a1', '   ')).toBeNull()
  })
})

describe('countRemaining', () => {
  it('counts items that are not done', () => {
    const items = [
      { id: '1', text: 'a', done: false },
      { id: '2', text: 'b', done: true },
      { id: '3', text: 'c', done: false },
    ]
    expect(countRemaining(items)).toBe(2)
  })

  it('returns 0 for an empty list or an all-done list', () => {
    expect(countRemaining([])).toBe(0)
    expect(countRemaining([{ id: '1', text: 'a', done: true }])).toBe(0)
  })
})

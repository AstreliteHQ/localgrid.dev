import { describe, expect, it } from 'vitest'
import { countRemaining, createTodoItem, isSafeHttpUrl } from './todoItem'

describe('createTodoItem', () => {
  it('creates an undone item from trimmed text, with no ticket/MR set', () => {
    expect(createTodoItem('a1', '  Buy milk  ')).toEqual({
      id: 'a1',
      text: 'Buy milk',
      done: false,
      ticket: '',
      mrUrl: '',
    })
  })

  it('returns null for empty or whitespace-only text', () => {
    expect(createTodoItem('a1', '')).toBeNull()
    expect(createTodoItem('a1', '   ')).toBeNull()
  })
})

describe('countRemaining', () => {
  it('counts items that are not done', () => {
    const items = [
      { id: '1', text: 'a', done: false, ticket: '', mrUrl: '' },
      { id: '2', text: 'b', done: true, ticket: '', mrUrl: '' },
      { id: '3', text: 'c', done: false, ticket: '', mrUrl: '' },
    ]
    expect(countRemaining(items)).toBe(2)
  })

  it('returns 0 for an empty list or an all-done list', () => {
    expect(countRemaining([])).toBe(0)
    expect(countRemaining([{ id: '1', text: 'a', done: true, ticket: '', mrUrl: '' }])).toBe(0)
  })
})

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHttpUrl('https://gitlab.com/org/repo/-/merge_requests/42')).toBe(true)
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
  })

  it('rejects a javascript: URL', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects a data: URL', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects unparseable or empty text', () => {
    expect(isSafeHttpUrl('')).toBe(false)
    expect(isSafeHttpUrl('not a url')).toBe(false)
  })
})

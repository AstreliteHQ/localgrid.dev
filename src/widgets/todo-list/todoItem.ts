/** The real logic behind an otherwise-CRUD to-do list: turning typed text
 * into an item (or not), attaching refs, and moving items around.
 * Toggling, removing and editing text are one-line array operations done
 * inline in the widget. */

import { extractRefs, parseRef } from './refs'

export interface TodoItem {
  id: string
  text: string
  done: boolean
  /** Raw URLs, ticket keys or free tags, shown as chips. Stored raw so the
   * labels can improve without touching the data. */
  refs: string[]
}

/** URLs in the draft become refs. A draft that is only refs is named after
 * the first one's label (e.g. "PR #42"), so a lone pasted link still
 * makes a readable item.
 * Returns null when nothing is left. */
export function createTodoItem(id: string, draftText: string): TodoItem | null {
  const { text, refs } = extractRefs(draftText)
  const name = text || (refs[0] ? parseRef(refs[0]).label : '')
  if (!name) return null
  return { id, text: name, done: false, refs }
}

export function countRemaining(items: TodoItem[]): number {
  return items.reduce((count, item) => (item.done ? count : count + 1), 0)
}

/** Appends trimmed, non-blank refs the item does not have yet. */
export function addRefs(item: TodoItem, raws: string[]): TodoItem {
  const refs = [...item.refs]
  for (const raw of raws) {
    const ref = raw.trim()
    if (ref && !refs.includes(ref)) refs.push(ref)
  }
  return refs.length === item.refs.length ? item : { ...item, refs }
}

/** Moves an item to `toIndex` of the full list (clamped). Works by id, so a
 * filtered view can reorder without knowing hidden items' positions. */
export function moveItem(items: TodoItem[], id: string, toIndex: number): TodoItem[] {
  const from = items.findIndex((item) => item.id === id)
  if (from < 0) return items
  const to = Math.max(0, Math.min(items.length - 1, toIndex))
  if (to === from) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

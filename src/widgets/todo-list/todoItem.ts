/** The one bit of real logic behind an otherwise-CRUD to-do list: turning
 * raw typed text into a real item (or not). Everything else (toggling,
 * removing, clearing completed) is a one-line array operation done inline
 * in the widget. */

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

/** Trims the draft text and returns a new item for it, or null for text
 * that's empty/whitespace-only — the one input validation this widget
 * needs. */
export function createTodoItem(id: string, draftText: string): TodoItem | null {
  const text = draftText.trim()
  if (!text) return null
  return { id, text, done: false }
}

export function countRemaining(items: TodoItem[]): number {
  return items.reduce((count, item) => (item.done ? count : count + 1), 0)
}

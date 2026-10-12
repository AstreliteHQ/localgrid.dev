/** The real logic behind an otherwise-CRUD to-do list: turning raw typed
 * text into a real item (or not), and deciding whether a typed merge
 * request URL is safe to render as a real link. Everything else (toggling,
 * removing, editing a field, clearing completed) is a one-line array
 * operation done inline in the widget. */

export interface TodoItem {
  id: string
  text: string
  done: boolean
  /** Both optional — a plain checklist is the common case, and most items
   * on it won't have either. Empty string (not undefined) means "not set",
   * so the widget's text inputs can stay simple controlled inputs. */
  ticket: string
  mrUrl: string
}

/** Trims the draft text and returns a new item for it, or null for text
 * that's empty/whitespace-only — the one input validation this widget
 * needs. */
export function createTodoItem(id: string, draftText: string): TodoItem | null {
  const text = draftText.trim()
  if (!text) return null
  return { id, text, done: false, ticket: '', mrUrl: '' }
}

export function countRemaining(items: TodoItem[]): number {
  return items.reduce((count, item) => (item.done ? count : count + 1), 0)
}

/** Only `http(s)` URLs are ever rendered as a real, clickable link — guards
 * against a pasted `javascript:`/`data:` URL being used as a merge request
 * link and executing when clicked, since this field is free-typed user
 * input rendered straight into an `href`. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

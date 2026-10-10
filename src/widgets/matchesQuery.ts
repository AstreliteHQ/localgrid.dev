import type { WidgetDefinition } from './types'

/** True if a widget matches a search query — checked against its name,
 * description, and search keywords. The single source of truth for "does
 * this widget match what was typed", shared by the sidebar's always-visible
 * catalog and the command palette, so both search the exact same fields the
 * exact same way rather than one silently covering less than the other. */
export function matchesQuery(widget: WidgetDefinition, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    widget.name.toLowerCase().includes(q) ||
    widget.description.toLowerCase().includes(q) ||
    (widget.keywords?.some((keyword) => keyword.toLowerCase().includes(q)) ?? false)
  )
}

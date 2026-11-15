import type { WidgetCategory, WidgetDefinition } from './types'
import { WIDGET_LIST } from './registry'

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  generators: 'Generators',
  formatting: 'Formatting',
  encoding: 'Encoding',
  security: 'Security',
  text: 'Text',
  devops: 'DevOps',
  math: 'Math',
  productivity: 'Productivity',
  time: 'Time',
  files: 'Files',
  color: 'Color',
}

/** Display order for category sections — not alphabetical, roughly
 * most-reached-for first. */
export const CATEGORY_ORDER: WidgetCategory[] = [
  'generators',
  'formatting',
  'encoding',
  'security',
  'text',
  'devops',
  'math',
  'productivity',
  'time',
  'files',
  'color',
]

export interface WidgetCategoryGroup {
  category: WidgetCategory
  label: string
  widgets: WidgetDefinition[]
}

/** Buckets widgets by category in display order, dropping empty categories.
 * Used by the sidebar; written to accept an arbitrary widget list so it
 * still works if that list is ever filtered (search, etc.) upstream. */
export function groupWidgetsByCategory(widgets: WidgetDefinition[] = WIDGET_LIST): WidgetCategoryGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    widgets: widgets.filter((widget) => widget.category === category),
  })).filter((group) => group.widgets.length > 0)
}

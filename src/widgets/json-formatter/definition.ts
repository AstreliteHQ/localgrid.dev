import { lazy } from 'react'
import { Braces } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jsonFormatterDefinition: WidgetDefinition = {
  id: 'json-formatter',
  name: 'JSON Formatter',
  description: 'Format, minify, and explore JSON as a collapsible tree',
  category: 'formatting',
  icon: Braces,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./JsonFormatterWidget')),
  keywords: ['json', 'format', 'pretty', 'minify', 'viewer'],
  connectors: {
    inputs: [{ field: 'input', label: 'JSON' }],
    output: { label: 'Formatted JSON' },
  },
}

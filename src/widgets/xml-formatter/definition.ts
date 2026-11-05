import { lazy } from 'react'
import { CodeXml } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const xmlFormatterDefinition: WidgetDefinition = {
  id: 'xml-formatter',
  name: 'XML Formatter',
  description: 'Format, minify, and explore XML as a collapsible tree',
  category: 'formatting',
  icon: CodeXml,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./XmlFormatterWidget')),
  keywords: ['xml', 'format', 'pretty', 'minify', 'viewer'],
  connectors: {
    inputs: [{ field: 'input', label: 'XML' }],
    output: { label: 'Formatted XML' },
  },
}

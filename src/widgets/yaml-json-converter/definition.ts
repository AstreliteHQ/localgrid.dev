import { lazy } from 'react'
import { Repeat } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const yamlJsonConverterDefinition: WidgetDefinition = {
  id: 'yaml-json-converter',
  name: 'YAML ↔ JSON Converter',
  description: 'Convert between YAML and JSON in either direction',
  category: 'formatting',
  icon: Repeat,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./YamlJsonConverterWidget')),
  keywords: ['yaml', 'yml', 'json', 'convert', 'serialize'],
  connectors: {
    inputs: [{ field: 'input', label: 'Source' }],
    output: { label: 'Converted' },
  },
}

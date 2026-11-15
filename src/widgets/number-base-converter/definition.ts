import { lazy } from 'react'
import { Binary } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const numberBaseConverterDefinition: WidgetDefinition = {
  id: 'number-base-converter',
  name: 'Number Base Converter',
  description: 'Convert integers between binary, octal, decimal, hex, and any custom base',
  category: 'encoding',
  icon: Binary,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./NumberBaseConverterWidget')),
  keywords: ['base', 'binary', 'octal', 'hex', 'hexadecimal', 'radix', 'convert'],
}

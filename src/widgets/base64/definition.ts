import { lazy } from 'react'
import { Binary } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const base64Definition: WidgetDefinition = {
  id: 'base64',
  name: 'Base64',
  description: 'Encode or decode text as Base64 (Unicode-safe)',
  category: 'encoding',
  icon: Binary,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  component: lazy(() => import('./Base64Widget')),
  keywords: ['base64', 'encode', 'decode', 'btoa', 'atob'],
  connectors: {
    inputs: [{ field: 'input', label: 'Text' }],
    output: { label: 'Result' },
  },
}

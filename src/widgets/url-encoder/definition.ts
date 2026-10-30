import { lazy } from 'react'
import { Link2 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const urlEncoderDefinition: WidgetDefinition = {
  id: 'url-encoder',
  name: 'URL Encoder',
  description: 'Encode or decode URL components',
  category: 'encoding',
  icon: Link2,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  component: lazy(() => import('./UrlEncoderWidget')),
  keywords: ['url', 'uri', 'encode', 'decode', 'percent'],
  connectors: {
    inputs: [{ field: 'input', label: 'Text' }],
    output: { label: 'Result' },
  },
}

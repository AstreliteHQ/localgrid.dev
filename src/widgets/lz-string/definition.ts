import { lazy } from 'react'
import { FileArchive } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const lzStringDefinition: WidgetDefinition = {
  id: 'lz-string',
  name: 'LZ-String',
  description: 'Compress or decompress text into the URL-safe LZ-String format',
  category: 'encoding',
  icon: FileArchive,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  component: lazy(() => import('./LzStringWidget')),
  keywords: ['lz-string', 'lzstring', 'compress', 'decompress', 'share link', 'url-safe'],
  connectors: {
    inputs: [{ field: 'input', label: 'Text' }],
    output: { label: 'Result' },
  },
}

import { lazy } from 'react'
import { Code2 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const codeSnippetDefinition: WidgetDefinition = {
  id: 'code-snippet',
  name: 'Code Snippet',
  description: 'Syntax-highlight a code snippet in 15 languages and export it as an image for docs or slides.',
  category: 'text',
  icon: Code2,
  defaultSize: { w: 5, h: 6 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./CodeSnippetWidget')),
  keywords: [
    'code',
    'syntax',
    'highlight',
    'highlighting',
    'snippet',
    'screenshot',
    'carbon',
    'image',
    'png',
    'word',
    'powerpoint',
    'slides',
    'presentation',
  ],
}

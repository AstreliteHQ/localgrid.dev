import { lazy } from 'react'
import { NotebookPen } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const scratchpadDefinition: WidgetDefinition = {
  id: 'scratchpad',
  name: 'Scratchpad',
  description: 'Rich text notes with pasted screenshots, copied or downloaded as HTML with the images embedded',
  category: 'text',
  icon: NotebookPen,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./ScratchpadWidget')),
  keywords: ['scratchpad', 'notes', 'rich text', 'wysiwyg', 'screenshot', 'image', 'paste', 'debugging', 'html'],
}

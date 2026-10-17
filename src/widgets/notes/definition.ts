import { lazy } from 'react'
import { NotebookText } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const notesDefinition: WidgetDefinition = {
  id: 'notes',
  name: 'Notes',
  description: 'Plain text notes with pasted/dropped image attachments and a word/character/reading-time breakdown',
  category: 'text',
  icon: NotebookText,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./NotesWidget')),
  keywords: [
    'notes',
    'text',
    'writing',
    'word count',
    'character count',
    'reading time',
    'image',
    'screenshot',
    'attachment',
  ],
}

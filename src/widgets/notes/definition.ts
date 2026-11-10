import { lazy } from 'react'
import { NotebookText } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const notesDefinition: WidgetDefinition = {
  id: 'notes',
  name: 'Notes',
  description: 'Plain text notes with a character, word, and reading-time breakdown',
  category: 'text',
  icon: NotebookText,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./NotesWidget')),
  keywords: ['notes', 'text', 'writing', 'word count', 'character count', 'reading time'],
  flow: {
    inputs: [{ field: 'content', label: 'Note' }],
    output: { label: 'Note' },
  },
}

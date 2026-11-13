import { lazy } from 'react'
import { NotebookPen } from 'lucide-react'
import * as v from 'valibot'
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
  // Opt-in through "Remember content"; the note is session state otherwise.
  // The document itself is TipTap JSON: only its outer shape is checked here,
  // the editor starts empty if it can't load it.
  dataSchema: v.object({
    remember: v.boolean(),
    savedDoc: v.nullable(
      v.looseObject({
        type: v.literal('doc'),
        content: v.optional(v.array(v.looseObject({ type: v.string() }))),
      }),
    ),
  }),
  keywords: ['scratchpad', 'notes', 'rich text', 'wysiwyg', 'screenshot', 'image', 'paste', 'debugging', 'html'],
}

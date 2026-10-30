import { lazy } from 'react'
import { Diff } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const textDiffDefinition: WidgetDefinition = {
  id: 'text-diff',
  name: 'Text Diff',
  description: 'Compare two texts line-by-line, word-by-word, or character-by-character',
  category: 'text',
  icon: Diff,
  defaultSize: { w: 6, h: 5 },
  minSize: { w: 4, h: 4 },
  component: lazy(() => import('./TextDiffWidget')),
  keywords: ['diff', 'compare', 'comparison', 'difference', 'merge', 'patch'],
  connectors: {
    inputs: [
      { field: 'original', label: 'Original' },
      { field: 'changed', label: 'Changed' },
    ],
  },
}

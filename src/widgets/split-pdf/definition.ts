import { lazy } from 'react'
import { Scissors } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const splitPdfDefinition: WidgetDefinition = {
  id: 'split-pdf',
  name: 'Split PDF',
  description: 'Break a PDF into separate files, one per page or by custom page ranges.',
  category: 'formatting',
  icon: Scissors,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./SplitPdfWidget')),
  keywords: ['pdf', 'split', 'extract', 'pages', 'separate', 'document', 'file'],
}

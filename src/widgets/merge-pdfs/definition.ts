import { lazy } from 'react'
import { FileStack } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const mergePdfsDefinition: WidgetDefinition = {
  id: 'merge-pdfs',
  name: 'Merge PDFs',
  description: 'Combine two or more PDFs into one, in whatever order you drag them into.',
  category: 'formatting',
  icon: FileStack,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./MergePdfsWidget')),
  keywords: ['pdf', 'merge', 'combine', 'join', 'concatenate', 'document', 'file'],
}

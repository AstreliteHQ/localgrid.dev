import { lazy } from 'react'
import { CopyMinus } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const duplicateRemoverDefinition: WidgetDefinition = {
  id: 'duplicate-remover',
  name: 'Duplicate Remover',
  description: 'Turn a list into a set, and see which items repeated and how many times',
  category: 'text',
  icon: CopyMinus,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./DuplicateRemoverWidget')),
  keywords: [
    'duplicate',
    'duplicates',
    'deduplicate',
    'dedupe',
    'unique',
    'uniq',
    'distinct',
    'set',
    'list',
    'lines',
    'count',
    'occurrences',
    'frequency',
    'repeated',
    'remove duplicates',
    'sort',
  ],
}

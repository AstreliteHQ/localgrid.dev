import { lazy } from 'react'
import { Regex } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const regexTesterDefinition: WidgetDefinition = {
  id: 'regex-tester',
  name: 'Regex Tester',
  description: 'Test a pattern against text with live match highlighting',
  category: 'text',
  icon: Regex,
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./RegexTesterWidget')),
  keywords: ['regex', 'regexp', 'pattern', 'match'],
  connectors: {
    inputs: [{ field: 'text', label: 'Test string' }],
  },
}

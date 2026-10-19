import { lazy } from 'react'
import { FileDiff } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jsonYamlDiffDefinition: WidgetDefinition = {
  id: 'json-yaml-diff',
  name: 'JSON / YAML Diff',
  description: 'Compare two JSON or YAML documents by structure, ignoring key order and formatting',
  category: 'formatting',
  icon: FileDiff,
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 4, h: 4 },
  component: lazy(() => import('./JsonYamlDiffWidget')),
  keywords: ['json', 'yaml', 'yml', 'diff', 'compare', 'difference', 'structural', 'kubernetes', 'manifest'],
}

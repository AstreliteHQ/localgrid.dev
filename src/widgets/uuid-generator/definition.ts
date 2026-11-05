import { lazy } from 'react'
import { Fingerprint } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const uuidGeneratorDefinition: WidgetDefinition = {
  id: 'uuid-generator',
  name: 'UUID Generator',
  description: 'Generate v1, v3, v4, v5, and v7 UUIDs',
  category: 'generators',
  icon: Fingerprint,
  defaultSize: { w: 2, h: 3 },
  // 2x2 was fine back when this was just a button and a list; with the v3/v5
  // namespace + name controls, that's not enough room for them to coexist
  // with the generated-UUID list without squeezing it out entirely.
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./UuidGeneratorWidget')),
  keywords: [
    'uuid',
    'guid',
    'random',
    'id',
    'v1',
    'v3',
    'v4',
    'v5',
    'v7',
    'namespace',
    'timestamp',
  ],
  flow: {
    output: { label: 'Latest UUID' },
  },
}

import { lazy } from 'react'
import { Clock9 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const timezoneCalculatorDefinition: WidgetDefinition = {
  id: 'timezone-calculator',
  name: 'Time Zone Calculator',
  description: 'Convert a time between two fixed UTC offsets, e.g. UTC+2 to UTC',
  category: 'time',
  icon: Clock9,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./TimezoneCalculatorWidget')),
  keywords: ['timezone', 'time zone', 'utc', 'gmt', 'offset', 'converter', 'calculator', 'meeting', 'time difference'],
}

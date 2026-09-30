import { lazy } from 'react'
import { Globe } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const worldClockDefinition: WidgetDefinition = {
  id: 'world-clock',
  name: 'World Clock',
  description: 'Track and convert times across cities on a day/night world map or an hour-by-hour timeline',
  category: 'time',
  icon: Globe,
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 4, h: 4 },
  component: lazy(() => import('./WorldClockWidget')),
  keywords: ['world clock', 'timezone', 'time zone', 'converter', 'utc', 'map', 'city', 'meeting planner', 'timeline'],
}

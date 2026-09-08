import { lazy } from 'react'
import { ChartNoAxesGantt } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const timelineBuilderDefinition: WidgetDefinition = {
  id: 'timeline-builder',
  name: 'Timeline Builder',
  description: 'Paste timestamps from logs and lay them out on colored timelines to see the order of events',
  category: 'time',
  icon: ChartNoAxesGantt,
  defaultSize: { w: 6, h: 5 },
  minSize: { w: 4, h: 4 },
  component: lazy(() => import('./TimelineBuilderWidget')),
  keywords: ['timeline', 'sequence', 'incident', 'debug', 'events', 'timestamp', 'chronology', 'gantt', 'timezone'],
}

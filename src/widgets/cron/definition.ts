import { lazy } from 'react'
import { CalendarClock } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const cronDefinition: WidgetDefinition = {
  id: 'cron',
  name: 'Cron Expression',
  description: 'Describe a cron expression in plain English and preview its next 3 triggers',
  category: 'formatting',
  icon: CalendarClock,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./CronWidget')),
  keywords: ['cron', 'crontab', 'schedule', 'trigger', 'next run'],
}

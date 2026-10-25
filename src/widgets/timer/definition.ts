import { lazy } from 'react'
import { Timer } from 'lucide-react'
import * as v from 'valibot'
import type { WidgetDefinition } from '@/widgets/types'

export const timerDefinition: WidgetDefinition = {
  id: 'timer',
  name: 'Timer',
  description: 'Local clock, lap-capable stopwatch, and an alerting countdown timer',
  category: 'time',
  icon: Timer,
  defaultSize: { w: 2, h: 3 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./TimerWidget')),
  configSchema: v.object({
    cdHours: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(99)),
    cdMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(59)),
    cdSeconds: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(59)),
  }),
  keywords: ['timer', 'clock', 'time', 'stopwatch', 'chronometer', 'countdown', 'alarm', 'lap', 'pomodoro'],
}

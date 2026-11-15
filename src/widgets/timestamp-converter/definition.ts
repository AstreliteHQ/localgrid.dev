import { lazy } from 'react'
import { Clock } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const timestampConverterDefinition: WidgetDefinition = {
  id: 'timestamp-converter',
  name: 'Timestamp Converter',
  description: 'Convert between Unix epoch and human-readable date/time',
  category: 'time',
  icon: Clock,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./TimestampConverterWidget')),
  keywords: ['unix', 'epoch', 'timestamp', 'date', 'time'],
}

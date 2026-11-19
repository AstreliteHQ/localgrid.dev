import { lazy } from 'react'
import { Ruler } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const unitConverterDefinition: WidgetDefinition = {
  id: 'unit-converter',
  name: 'Unit Converter',
  description: 'Convert length, mass, volume, data size, time, and temperature units, plus rates like MB/s or km/h',
  category: 'math',
  icon: Ruler,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./UnitConverterWidget')),
  keywords: [
    'unit',
    'convert',
    'length',
    'mass',
    'weight',
    'volume',
    'temperature',
    'data',
    'bytes',
    'rate',
    'speed',
    'per second',
    'bandwidth',
    'flow',
  ],
}

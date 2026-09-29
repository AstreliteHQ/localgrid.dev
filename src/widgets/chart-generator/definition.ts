import { lazy } from 'react'
import { ChartColumn } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const chartGeneratorDefinition: WidgetDefinition = {
  id: 'chart-generator',
  name: 'Chart Generator',
  description: 'Build a quick bar, line, or pie chart with a title and custom colors, then download it as a PNG',
  category: 'generators',
  icon: ChartColumn,
  defaultSize: { w: 5, h: 6 },
  minSize: { w: 3, h: 5 },
  component: lazy(() => import('./ChartGeneratorWidget')),
  keywords: [
    'chart',
    'graph',
    'visualization',
    'bar chart',
    'line chart',
    'pie chart',
    'camembert',
    'plot',
    'png',
    'download',
  ],
}

import { lazy } from 'react'
import { Sigma } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const statisticsCalculatorDefinition: WidgetDefinition = {
  id: 'statistics-calculator',
  name: 'Statistics Calculator',
  description: 'Mean, median, mode, variance, and standard deviation for a list of numbers',
  category: 'math',
  icon: Sigma,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./StatisticsCalculatorWidget')),
  keywords: ['statistics', 'mean', 'median', 'mode', 'variance', 'standard deviation', 'average'],
}

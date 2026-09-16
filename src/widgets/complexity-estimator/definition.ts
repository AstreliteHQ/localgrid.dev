import { lazy } from 'react'
import { Gauge } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const complexityEstimatorDefinition: WidgetDefinition = {
  id: 'complexity-estimator',
  name: 'Big-O Estimator',
  description: 'Estimate how a JavaScript or TypeScript snippet scales, from its loops, calls and recursion',
  category: 'math',
  icon: Gauge,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./ComplexityEstimatorWidget')),
  keywords: [
    'big o',
    'big-o',
    'complexity',
    'time complexity',
    'algorithmic complexity',
    'performance',
    'asymptotic',
    'quadratic',
    'linear',
    'logarithmic',
    'exponential',
    'recursion',
    'loops',
    'scaling',
    'code',
    'javascript',
    'typescript',
  ],
}

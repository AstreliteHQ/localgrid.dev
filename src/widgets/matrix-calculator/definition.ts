import { lazy } from 'react'
import { Grid3x3 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const matrixCalculatorDefinition: WidgetDefinition = {
  id: 'matrix-calculator',
  name: 'Matrix Calculator',
  description: 'Add, subtract, multiply, transpose, and invert matrices, or take a determinant',
  category: 'math',
  icon: Grid3x3,
  defaultSize: { w: 5, h: 6 },
  minSize: { w: 3, h: 5 },
  component: lazy(() => import('./MatrixCalculatorWidget')),
  keywords: [
    'matrix',
    'matrices',
    'linear algebra',
    'determinant',
    'inverse',
    'transpose',
    'vector',
    'multiply',
    'gaussian elimination',
  ],
}

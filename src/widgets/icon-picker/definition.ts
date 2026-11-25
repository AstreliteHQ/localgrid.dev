import { lazy } from 'react'
import { Shapes } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const iconPickerDefinition: WidgetDefinition = {
  id: 'icon-picker',
  name: 'Icon Picker',
  description: 'Search the Lucide icons, set color, stroke, size and padding, then copy or download as SVG or PNG',
  category: 'generators',
  icon: Shapes,
  defaultSize: { w: 7, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./IconPickerWidget')),
  keywords: ['icon', 'icons', 'lucide', 'svg', 'png', 'symbol', 'glyph', 'picker', 'slides', 'logo'],
  flow: {
    inputs: [{ field: 'search', label: 'Search' }],
    output: { label: 'SVG' },
  },
}

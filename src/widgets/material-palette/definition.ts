import { lazy } from 'react'
import { Grid3x3 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const materialPaletteDefinition: WidgetDefinition = {
  id: 'material-palette',
  name: 'Material Color Palette',
  description: 'Generate a Material Design style 50-900 tonal scale and accents from one seed color',
  category: 'color',
  icon: Grid3x3,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./MaterialPaletteWidget')),
  keywords: ['color', 'material design', 'palette', 'tones', 'shades', 'tints', 'swatches'],
}

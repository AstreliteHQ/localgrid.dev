import { lazy } from 'react'
import { Blend } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const oklchColorDefinition: WidgetDefinition = {
  id: 'oklch-color',
  name: 'OKLCH Color',
  description: 'Edit a color in OKLCH with sliders, convert it to hex, RGB and HSL, and see when it leaves sRGB',
  category: 'color',
  icon: Blend,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./OklchColorWidget')),
  keywords: ['oklch', 'oklab', 'color', 'colour', 'hex', 'rgb', 'hsl', 'gamut', 'p3', 'srgb', 'css', 'picker'],
  flow: {
    inputs: [{ field: 'input', label: 'Color' }],
    output: { label: 'OKLCH' },
  },
}

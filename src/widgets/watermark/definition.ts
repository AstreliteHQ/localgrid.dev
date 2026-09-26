import { lazy } from 'react'
import { Stamp } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const watermarkDefinition: WidgetDefinition = {
  id: 'watermark',
  name: 'Watermark',
  description: 'Stamp diagonal watermark text across an image or every page of a PDF.',
  category: 'image',
  icon: Stamp,
  defaultSize: { w: 4, h: 6 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./WatermarkWidget')),
  keywords: ['watermark', 'stamp', 'pdf', 'image', 'confidential', 'overlay', 'brand'],
}

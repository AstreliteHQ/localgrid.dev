import { lazy } from 'react'
import { Stamp } from 'lucide-react'
import * as v from 'valibot'
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
  // Position values mirror `WatermarkPosition`, inlined to keep pdf-lib
  // out of the registry bundle.
  configSchema: v.object({
    text: v.string(),
    opacity: v.pipe(v.number(), v.minValue(5), v.maxValue(100)),
    color: v.pipe(v.string(), v.hexColor()),
    fontSize: v.pipe(v.number(), v.minValue(12), v.maxValue(120)),
    position: v.picklist(['center', 'tiled']),
  }),
  keywords: ['watermark', 'stamp', 'pdf', 'image', 'confidential', 'overlay', 'brand'],
}

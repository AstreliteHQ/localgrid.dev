import { lazy } from 'react'
import { FileArchive } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const pngOptimizerDefinition: WidgetDefinition = {
  id: 'png-optimizer',
  name: 'PNG Optimizer',
  description: 'Shrink a PNG without changing a single pixel: strips metadata, reduces colors and recompresses.',
  category: 'image',
  icon: FileArchive,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./PngOptimizerWidget')),
  keywords: [
    'png',
    'optimize',
    'optimizer',
    'compress',
    'shrink',
    'minify',
    'lossless',
    'metadata',
    'strip',
    'exif',
    'palette',
    'deflate',
    'oxipng',
    'optipng',
    'tinypng',
    'image',
    'size',
  ],
}

import { lazy } from 'react'
import { ImagePlus } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const imageBufferDefinition: WidgetDefinition = {
  id: 'image-buffer',
  name: 'Image Buffer',
  description:
    'A scratch pad for images: paste or drop screenshots, keep several at hand, copy or download any of them',
  category: 'image',
  icon: ImagePlus,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./ImageBufferWidget')),
  keywords: [
    'image',
    'images',
    'buffer',
    'scratch',
    'scratchpad',
    'clipboard',
    'paste',
    'screenshot',
    'picture',
    'photo',
    'gallery',
    'drag and drop',
    'copy',
    'download',
  ],
}

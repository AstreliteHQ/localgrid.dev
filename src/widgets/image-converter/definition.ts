import { lazy } from 'react'
import { Images } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const imageConverterDefinition: WidgetDefinition = {
  id: 'image-converter',
  name: 'Image Converter',
  description: 'Drop an image, get it back as PNG, JPEG, WebP or AVIF. Source format detected from its bytes.',
  category: 'image',
  icon: Images,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./ImageConverterWidget')),
  keywords: [
    'image',
    'convert',
    'converter',
    'picture',
    'photo',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'avif',
    'gif',
    'bmp',
    'tiff',
    'ico',
    'heic',
    'svg',
    'raster',
    'compress',
    'quality',
    'resize',
    'drag and drop',
  ],
}

import { lazy } from 'react'
import { FileImage } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const imageMetadataDefinition: WidgetDefinition = {
  id: 'image-metadata',
  name: 'Image Metadata',
  description: 'View, edit or strip the EXIF, IPTC and XMP fields of a JPEG, PNG or WebP before downloading it.',
  category: 'image',
  icon: FileImage,
  defaultSize: { w: 5, h: 6 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./ImageMetadataWidget')),
  keywords: [
    'exif',
    'iptc',
    'xmp',
    'metadata',
    'meta',
    'gps',
    'location',
    'geotag',
    'privacy',
    'strip',
    'remove',
    'scrub',
    'camera',
    'copyright',
    'caption',
    'keywords',
    'exiftool',
    'photo',
    'jpeg',
    'image',
  ],
}

import { lazy } from 'react'
import { HardDrive } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const fileSizeConverterDefinition: WidgetDefinition = {
  id: 'file-size-converter',
  name: 'File Size Converter',
  description: 'Convert a file size across every unit at once, decimal (KB, MB, GB) and binary (KiB, MiB, GiB)',
  category: 'math',
  icon: HardDrive,
  defaultSize: { w: 3, h: 5 },
  minSize: { w: 2, h: 4 },
  component: lazy(() => import('./FileSizeConverterWidget')),
  keywords: [
    'file size',
    'byte',
    'bytes',
    'bit',
    'kilobyte',
    'megabyte',
    'gigabyte',
    'terabyte',
    'petabyte',
    'kibibyte',
    'mebibyte',
    'gibibyte',
    'kb',
    'mb',
    'gb',
    'tb',
    'kib',
    'mib',
    'gib',
    'storage',
    'disk',
    'convert',
  ],
}

import { lazy } from 'react'
import { ClipboardList } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const clipboardInspectorDefinition: WidgetDefinition = {
  id: 'clipboard-inspector',
  name: 'Clipboard Inspector',
  description: 'Paste anything to see every format the clipboard carries, preview each one and copy back just one',
  category: 'text',
  icon: ClipboardList,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./ClipboardInspectorWidget')),
  keywords: [
    'clipboard',
    'paste',
    'copy',
    'mime',
    'media type',
    'format',
    'text/html',
    'text/plain',
    'rtf',
    'rich text',
    'uri-list',
    'image',
    'inspect',
    'datatransfer',
  ],
}

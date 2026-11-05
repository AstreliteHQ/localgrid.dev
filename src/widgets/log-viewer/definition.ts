import { lazy } from 'react'
import { ScrollText } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const logViewerDefinition: WidgetDefinition = {
  id: 'log-viewer',
  name: 'Log Viewer',
  description: 'Paste application logs, highlight timestamps and common failure patterns, and jump between them',
  category: 'text',
  icon: ScrollText,
  defaultSize: { w: 6, h: 5 },
  minSize: { w: 4, h: 4 },
  component: lazy(() => import('./LogViewerWidget')),
  keywords: ['log', 'logs', 'error', 'exception', 'warning', 'critical', 'timeout', 'grep', 'trace'],
  flow: {
    inputs: [{ field: 'logText', label: 'Logs' }],
  },
}

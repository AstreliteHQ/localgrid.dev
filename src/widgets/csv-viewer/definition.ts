import { lazy } from 'react'
import { Table2 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const csvViewerDefinition: WidgetDefinition = {
  id: 'csv-viewer',
  name: 'CSV Viewer',
  description: 'Paste or drop a CSV file and preview it as a table, no spreadsheet app needed',
  category: 'formatting',
  icon: Table2,
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 4, h: 4 },
  component: lazy(() => import('./CsvViewerWidget')),
  keywords: ['csv', 'tsv', 'table', 'spreadsheet', 'excel', 'data', 'delimiter', 'tabular'],
}

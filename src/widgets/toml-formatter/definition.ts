import { lazy } from 'react'
import { FileSliders } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const tomlFormatterDefinition: WidgetDefinition = {
  id: 'toml-formatter',
  name: 'TOML Formatter',
  description: 'Validate and format TOML, explore it as a tree, and convert to or from JSON',
  category: 'formatting',
  icon: FileSliders,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./TomlFormatterWidget')),
  keywords: ['toml', 'json', 'format', 'validate', 'convert', 'cargo', 'pyproject', 'config'],
  flow: {
    inputs: [{ field: 'input', label: 'Source' }],
    output: { label: 'Converted' },
  },
}

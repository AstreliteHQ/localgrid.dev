import { lazy } from 'react'
import { LayoutTemplate } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jinjaTemplateRendererDefinition: WidgetDefinition = {
  id: 'jinja-template-renderer',
  name: 'Jinja Template Renderer',
  description: 'Render a Jinja-style template (via Nunjucks) against JSON or YAML data',
  category: 'formatting',
  icon: LayoutTemplate,
  defaultSize: { w: 4, h: 8 },
  minSize: { w: 3, h: 6 },
  component: lazy(() => import('./JinjaTemplateRendererWidget')),
  keywords: [
    'jinja',
    'jinja2',
    'template',
    'templating',
    'nunjucks',
    'render',
    'json',
    'yaml',
    'ansible',
    'for loop',
    'filter',
  ],
}

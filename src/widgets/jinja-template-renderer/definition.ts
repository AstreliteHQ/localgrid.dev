import { lazy } from 'react'
import { LayoutTemplate } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jinjaTemplateRendererDefinition: WidgetDefinition = {
  id: 'jinja-template-renderer',
  name: 'Jinja Template Renderer',
  description: 'Render a Jinja-style template (via Nunjucks) against JSON or YAML data',
  category: 'formatting',
  icon: LayoutTemplate,
  defaultSize: { w: 7, h: 6 },
  // Narrower than the default is fine — below the width the widget needs
  // for 3 side-by-side panes, it falls back to a vertical stack.
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

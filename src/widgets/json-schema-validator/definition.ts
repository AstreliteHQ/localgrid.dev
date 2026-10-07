import { lazy } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jsonSchemaValidatorDefinition: WidgetDefinition = {
  id: 'json-schema-validator',
  name: 'JSON Schema Validator',
  description: 'Validate a JSON or YAML document against a JSON Schema',
  category: 'formatting',
  icon: ShieldCheck,
  defaultSize: { w: 6, h: 7 },
  minSize: { w: 4, h: 5 },
  component: lazy(() => import('./JsonSchemaValidatorWidget')),
  keywords: ['json schema', 'validate', 'validator', 'yaml', 'schema', 'ajv'],
}

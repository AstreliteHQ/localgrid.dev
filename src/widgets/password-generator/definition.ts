import { lazy } from 'react'
import { KeyRound } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const passwordGeneratorDefinition: WidgetDefinition = {
  id: 'password-generator',
  name: 'Password Generator',
  description: 'Generate random passwords with a strength meter',
  category: 'security',
  icon: KeyRound,
  defaultSize: { w: 2, h: 3 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./PasswordGeneratorWidget')),
  keywords: ['password', 'generator', 'random', 'passphrase', 'strength', 'security', 'secret'],
  connectors: {
    output: { label: 'Password' },
  },
}

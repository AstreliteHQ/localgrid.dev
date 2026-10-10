import { lazy } from 'react'
import { Tag } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const semverDefinition: WidgetDefinition = {
  id: 'semver',
  name: 'SemVer Checker',
  description: 'Break a version into its parts, check SemVer 2.0.0 compliance, and test it against an npm-style range',
  category: 'text',
  icon: Tag,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./SemverWidget')),
  keywords: [
    'semver',
    'semantic versioning',
    'version',
    'range',
    'caret',
    'tilde',
    'npm',
    'satisfies',
    'pre-release',
    'release',
    'compare',
  ],
}

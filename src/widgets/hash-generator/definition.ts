import { lazy } from 'react'
import { Hash } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const hashGeneratorDefinition: WidgetDefinition = {
  id: 'hash-generator',
  name: 'Hash Generator',
  description: 'MD5, SHA-1, SHA-256, SHA-384, and SHA-512 hashes of text',
  category: 'security',
  icon: Hash,
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./HashGeneratorWidget')),
  keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'checksum'],
  connectors: {
    inputs: [{ field: 'input', label: 'Text' }],
    output: { label: 'Hash' },
  },
}

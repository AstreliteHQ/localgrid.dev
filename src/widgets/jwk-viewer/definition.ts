import { lazy } from 'react'
import { FileKey2 } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jwkViewerDefinition: WidgetDefinition = {
  id: 'jwk-viewer',
  name: 'JWK Viewer',
  description: 'Inspect a JSON Web Key or JWK Set: type, size, use, and RFC 7638 thumbprint',
  category: 'security',
  icon: FileKey2,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./JwkViewerWidget')),
  keywords: [
    'jwk',
    'json web key',
    'jwks',
    'jose',
    'thumbprint',
    'rfc 7638',
    'jwt',
    'public key',
    'rsa',
    'ec',
    'okp',
    'oct',
  ],
}

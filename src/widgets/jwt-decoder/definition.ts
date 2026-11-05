import { lazy } from 'react'
import { KeyRound } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const jwtDecoderDefinition: WidgetDefinition = {
  id: 'jwt-decoder',
  name: 'JWT Encoder',
  description: 'Encode or decode a JWT — sign with HS256, or inspect a token’s header and payload',
  category: 'encoding',
  icon: KeyRound,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./JwtDecoderWidget')),
  keywords: ['jwt', 'json web token', 'decode', 'encode', 'sign', 'hs256', 'auth'],
  connectors: {
    inputs: [
      { field: 'token', label: 'Token' },
      { field: 'payloadJson', label: 'Payload' },
    ],
    output: { label: 'Payload or token' },
  },
}

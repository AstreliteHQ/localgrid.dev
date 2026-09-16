import { lazy } from 'react'
import { Binary } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const protobufDecoderDefinition: WidgetDefinition = {
  id: 'protobuf-decoder',
  name: 'Protobuf Decoder',
  description: 'Decode a protobuf payload from base64 or hex, with its .proto definition or without one',
  category: 'encoding',
  icon: Binary,
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./ProtobufDecoderWidget')),
  keywords: [
    'protobuf',
    'proto',
    'protocol buffers',
    'grpc',
    'wire format',
    'varint',
    'decode',
    'binary',
    'base64',
    'hex',
    'serialization',
    'message',
    'schema',
  ],
}

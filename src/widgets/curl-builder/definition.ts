import { lazy } from 'react'
import { Terminal } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const curlBuilderDefinition: WidgetDefinition = {
  id: 'curl-builder',
  name: 'cURL Builder',
  description: 'Build a curl command from headers, query params, body, auth, and flags, then copy it',
  category: 'network',
  icon: Terminal,
  defaultSize: { w: 4, h: 7 },
  minSize: { w: 3, h: 6 },
  component: lazy(() => import('./CurlBuilderWidget')),
  keywords: [
    'curl',
    'http',
    'request',
    'api',
    'rest',
    'header',
    'headers',
    'query',
    'params',
    'body',
    'json',
    'auth',
    'authorization',
    'bearer',
    'basic auth',
    'cookie',
    'form data',
    'multipart',
    'shell',
    'command',
    'terminal',
    'webhook',
  ],
}

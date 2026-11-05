import { lazy } from 'react'
import { Server } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const kubeconfigViewerDefinition: WidgetDefinition = {
  id: 'kubeconfig-viewer',
  name: 'Kubeconfig Viewer',
  description:
    'Paste a kubeconfig and see its contexts, clusters, and users at a glance, with a sanitized copy for sharing',
  category: 'security',
  icon: Server,
  defaultSize: { w: 7, h: 7 },
  minSize: { w: 5, h: 5 },
  component: lazy(() => import('./KubeconfigViewerWidget')),
  keywords: ['kubernetes', 'k8s', 'kubectl', 'kubeconfig', 'cluster', 'context', 'cloud', 'devops'],
}

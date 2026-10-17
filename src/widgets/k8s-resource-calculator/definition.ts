import { lazy } from 'react'
import { Cpu } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const k8sResourceCalculatorDefinition: WidgetDefinition = {
  id: 'k8s-resource-calculator',
  name: 'K8s Resource Calculator',
  description:
    'Paste a Kubernetes manifest and total the CPU/memory requests and limits across every container, init container, and ephemeral container',
  category: 'math',
  icon: Cpu,
  defaultSize: { w: 7, h: 7 },
  minSize: { w: 5, h: 5 },
  component: lazy(() => import('./K8sResourceCalculatorWidget')),
  keywords: [
    'kubernetes',
    'k8s',
    'kubectl',
    'pod',
    'deployment',
    'cronjob',
    'resources',
    'requests',
    'limits',
    'cpu',
    'memory',
    'cluster',
    'devops',
  ],
}

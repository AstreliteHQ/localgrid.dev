import { lazy } from 'react'
import { Network } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const subnetCalculatorDefinition: WidgetDefinition = {
  id: 'subnet-calculator',
  name: 'Subnet Calculator',
  description: 'Network/broadcast address, host range, and mask for an IPv4 CIDR block',
  category: 'devops',
  icon: Network,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./SubnetCalculatorWidget')),
  keywords: ['subnet', 'cidr', 'ip', 'ipv4', 'netmask', 'network', 'broadcast', 'wildcard'],
}

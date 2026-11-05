import { lazy } from 'react'
import { FileBadge } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const certificateViewerDefinition: WidgetDefinition = {
  id: 'certificate-viewer',
  name: 'Certificate Viewer',
  description: 'Inspect X.509/PEM certificates: subject, validity, SANs, fingerprints',
  category: 'security',
  icon: FileBadge,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./CertificateViewerWidget')),
  keywords: ['certificate', 'x509', 'x.509', 'pem', 'ssl', 'tls', 'cert', 'der', 'asn.1', 'fingerprint'],
  connectors: {
    inputs: [{ field: 'input', label: 'Certificate (PEM)' }],
  },
}

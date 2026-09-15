import { lazy } from 'react'
import { QrCode } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const qrCodeDefinition: WidgetDefinition = {
  id: 'qr-code',
  name: 'QR Code Generator',
  description: 'Generate a customizable QR code for text, Wi-Fi, email, SMS, a phone number, or a contact card',
  category: 'generators',
  icon: QrCode,
  defaultSize: { w: 3, h: 5 },
  minSize: { w: 3, h: 4 },
  component: lazy(() => import('./QrCodeWidget')),
  keywords: ['qr', 'qr code', 'barcode', 'wifi', 'vcard', 'contact', 'sms', 'email', 'url', 'generator'],
}

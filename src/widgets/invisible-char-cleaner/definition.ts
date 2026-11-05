import { lazy } from 'react'
import { EyeOff } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const invisibleCharCleanerDefinition: WidgetDefinition = {
  id: 'invisible-char-cleaner',
  name: 'Invisible Character Cleaner',
  description:
    'Detect, highlight, and strip zero-width, bidi, and hidden Unicode tag characters from AI-generated text',
  category: 'ai',
  icon: EyeOff,
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./InvisibleCharCleanerWidget')),
  keywords: [
    'unicode',
    'zero width space',
    'zwsp',
    'bom',
    'bidi',
    'watermark',
    'watermarking',
    'steganography',
    'prompt injection',
    'ascii smuggling',
    'chatgpt',
    'llm',
    'hidden characters',
    'sanitize',
    'strip',
    'whitespace',
  ],
  connectors: {
    inputs: [{ field: 'input', label: 'Text' }],
    output: { label: 'Cleaned text' },
  },
}

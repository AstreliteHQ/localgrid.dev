import { lazy } from 'react'
import { Calculator } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const tokenCounterDefinition: WidgetDefinition = {
  id: 'token-counter',
  name: 'Token Counter',
  description: 'Estimate ChatGPT and Claude token counts for a prompt from word/character counts, no API key needed',
  category: 'ai',
  icon: Calculator,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  component: lazy(() => import('./TokenCounterWidget')),
  keywords: [
    'tokens',
    'tokenizer',
    'gpt',
    'gpt-4',
    'gpt-4o',
    'gpt-5',
    'chatgpt',
    'openai',
    'claude',
    'anthropic',
    'prompt length',
    'context window',
    'estimate',
  ],
}

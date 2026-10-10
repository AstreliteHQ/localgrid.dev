import { describe, expect, it } from 'vitest'
import { Braces } from 'lucide-react'
import { lazy } from 'react'
import type { WidgetDefinition } from './types'
import { matchesQuery } from './matchesQuery'

const WIDGET: WidgetDefinition = {
  id: 'merge-pdfs',
  name: 'Merge PDFs',
  description: 'Combine two or more PDFs into one, in whatever order you drag them into.',
  category: 'formatting',
  icon: Braces,
  defaultSize: { w: 4, h: 5 },
  keywords: ['pdf', 'merge', 'combine', 'join', 'concatenate'],
  component: lazy(() => Promise.reject(new Error('never rendered in this test'))),
}

describe('matchesQuery', () => {
  it('matches everything for a blank or whitespace-only query', () => {
    expect(matchesQuery(WIDGET, '')).toBe(true)
    expect(matchesQuery(WIDGET, '   ')).toBe(true)
  })

  it('matches on the widget name, case-insensitively', () => {
    expect(matchesQuery(WIDGET, 'merge pdfs')).toBe(true)
    expect(matchesQuery(WIDGET, 'MERGE')).toBe(true)
  })

  it('matches on a keyword even when it is not in the name', () => {
    expect(matchesQuery(WIDGET, 'concatenate')).toBe(true)
  })

  it('matches on text that only appears in the description', () => {
    expect(matchesQuery(WIDGET, 'whatever order')).toBe(true)
    expect(matchesQuery(WIDGET, 'drag them')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesQuery(WIDGET, 'base64 encode')).toBe(false)
  })
})

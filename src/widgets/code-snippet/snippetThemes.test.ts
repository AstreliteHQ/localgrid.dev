import { describe, expect, it } from 'vitest'
import type { TokenCategory } from './tokenizeCode'
import { SNIPPET_THEMES } from './snippetThemes'

const ALL_CATEGORIES: TokenCategory[] = [
  'comment',
  'keyword',
  'string',
  'number',
  'function',
  'type',
  'property',
  'variable',
  'tag',
  'attribute',
  'punctuation',
  'meta',
  'heading',
  'strong',
  'emphasis',
  'link',
  'url',
  'code',
  'quote',
  'list',
]

describe('SNIPPET_THEMES', () => {
  it.each(Object.values(SNIPPET_THEMES))('$label theme styles every token category', (theme) => {
    for (const category of ALL_CATEGORIES) {
      expect(theme.categories[category], `missing a "${category}" style in the ${theme.label} theme`).toBeDefined()
    }
  })

  it.each(Object.values(SNIPPET_THEMES))('$label theme uses valid hex colors throughout', (theme) => {
    const hex = /^#[0-9a-f]{6}$/i
    expect(theme.background).toMatch(hex)
    expect(theme.foreground).toMatch(hex)
    for (const style of Object.values(theme.categories)) {
      expect(style?.color).toMatch(hex)
    }
  })

  it.each(Object.values(SNIPPET_THEMES))('$label theme has a translucent highlight background', (theme) => {
    expect(theme.highlightBackground).toMatch(/^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0(\.\d+)?\)$/)
  })
})

import { describe, expect, it } from 'vitest'
import { LANGUAGES, loadParser } from './languages'

describe('LANGUAGES', () => {
  it('lists plaintext first, and every id exactly once', () => {
    expect(LANGUAGES[0].id).toBe('plaintext')
    const ids = LANGUAGES.map((language) => language.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('loadParser', () => {
  it('resolves null for plaintext', async () => {
    expect(await loadParser('plaintext')).toBeNull()
  })

  it('resolves null for an unrecognized id', async () => {
    expect(await loadParser('not-a-real-language')).toBeNull()
  })

  it('resolves a real parser for every listed language other than plaintext', async () => {
    const languageIds = LANGUAGES.map((language) => language.id).filter((id) => id !== 'plaintext')
    for (const id of languageIds) {
      const parser = await loadParser(id)
      expect(parser, `expected a parser for "${id}"`).not.toBeNull()
      // Confirm it's a real, usable @lezer/common Parser rather than just
      // some truthy object — every one of these should parse an empty
      // document without throwing.
      expect(() => parser!.parse('')).not.toThrow()
    }
  })
})

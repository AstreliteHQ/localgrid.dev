import { describe, expect, it } from 'vitest'
import { LANGUAGES, loadLanguage } from './languages'

describe('LANGUAGES', () => {
  it('lists plaintext first, and every id exactly once', () => {
    expect(LANGUAGES[0].id).toBe('plaintext')
    const ids = LANGUAGES.map((language) => language.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('loadLanguage', () => {
  it('resolves null for plaintext', async () => {
    expect(await loadLanguage('plaintext')).toBeNull()
  })

  it('resolves null for an unrecognized id', async () => {
    expect(await loadLanguage('not-a-real-language')).toBeNull()
  })

  it('resolves a real parser and extension for every listed language other than plaintext', async () => {
    const languageIds = LANGUAGES.map((language) => language.id).filter((id) => id !== 'plaintext')
    for (const id of languageIds) {
      const loaded = await loadLanguage(id)
      expect(loaded, `expected a language for "${id}"`).not.toBeNull()
      expect(loaded!.extension, `expected an extension for "${id}"`).toBeTruthy()
      // Confirm it's a real, usable @lezer/common Parser rather than just
      // some truthy object — every one of these should parse an empty
      // document without throwing.
      expect(() => loaded!.parser.parse('')).not.toThrow()
    }
  })
})

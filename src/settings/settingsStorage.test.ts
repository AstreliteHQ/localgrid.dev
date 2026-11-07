import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY, readSettings, writeSettingsSection } from './settingsStorage'

const stored = () => JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')

describe('settingsStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes one section without touching the others', () => {
    writeSettingsSection('theme', 'dark')
    writeSettingsSection('flow', { enabled: false })

    expect(stored()).toEqual({ theme: 'dark', flow: { enabled: false } })
  })

  it('moves a theme saved under the old key in, once', () => {
    window.localStorage.setItem('localgrid.theme', 'light')

    expect(readSettings()).toEqual({ theme: 'light' })
    expect(stored()).toEqual({ theme: 'light' })
    expect(window.localStorage.getItem('localgrid.theme')).toBeNull()
  })

  it('keeps the legacy theme when the migration cannot write', () => {
    window.localStorage.setItem('localgrid.theme', 'dark')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(readSettings()).toEqual({ theme: 'dark' })
    expect(window.localStorage.getItem('localgrid.theme')).toBe('dark')
  })

  it('reads corrupted or unexpected content as no settings', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json')
    expect(readSettings()).toEqual({})

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '42')
    expect(readSettings()).toEqual({})
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_STORAGE_KEY, readSettings, writeSettingsSection } from './settingsStorage'

const stored = () => JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')

describe('settingsStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('writes one section without touching the others', () => {
    writeSettingsSection('theme', 'dark')
    writeSettingsSection('connectors', { enabled: false })

    expect(stored()).toEqual({ theme: 'dark', connectors: { enabled: false } })
  })

  it('moves a theme saved under the old key in, once', () => {
    window.localStorage.setItem('localgrid.theme', 'light')

    expect(readSettings()).toEqual({ theme: 'light' })
    expect(stored()).toEqual({ theme: 'light' })
    expect(window.localStorage.getItem('localgrid.theme')).toBeNull()
  })

  it('reads corrupted or unexpected content as no settings', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json')
    expect(readSettings()).toEqual({})

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '42')
    expect(readSettings()).toEqual({})
  })
})

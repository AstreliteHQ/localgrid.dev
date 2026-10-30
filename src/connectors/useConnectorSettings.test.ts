import { describe, expect, it } from 'vitest'
import { readSettings } from '@/settings/settingsStorage'
import { DEFAULT_CONNECTOR_SETTINGS, sanitizeSettings, useConnectorSettings } from './useConnectorSettings'

describe('useConnectorSettings', () => {
  it('saves changes in the connectors section of the grouped settings', () => {
    useConnectorSettings.getState().setColor(0, '#123456')
    useConnectorSettings.getState().setEnabled(false)

    expect(readSettings().connectors).toMatchObject({ enabled: false, colors: expect.arrayContaining(['#123456']) })
  })

  it('falls back to the default for each stored value with the wrong shape', () => {
    expect(sanitizeSettings({ enabled: 'yes', animation: 'always', showSourceLabels: false, colors: ['red'] })).toEqual(
      { ...DEFAULT_CONNECTOR_SETTINGS, animation: 'always', showSourceLabels: false },
    )
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_CONNECTOR_SETTINGS)
  })
})

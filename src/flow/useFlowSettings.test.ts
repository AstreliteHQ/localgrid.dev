import { describe, expect, it } from 'vitest'
import { readSettings } from '@/settings/settingsStorage'
import { DEFAULT_FLOW_SETTINGS, sanitizeSettings, useFlowSettings } from './useFlowSettings'

describe('useFlowSettings', () => {
  it('saves changes in the flow section of the grouped settings', () => {
    useFlowSettings.getState().setColor(0, '#123456')
    useFlowSettings.getState().setEnabled(false)

    expect(readSettings().flow).toMatchObject({ enabled: false, colors: expect.arrayContaining(['#123456']) })
  })

  it('falls back to the default for each stored value with the wrong shape', () => {
    expect(sanitizeSettings({ enabled: 'yes', animation: 'always', showSourceLabels: false, colors: ['red'] })).toEqual(
      { ...DEFAULT_FLOW_SETTINGS, animation: 'always', showSourceLabels: false },
    )
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_FLOW_SETTINGS)
  })
})

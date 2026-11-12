import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_DATA_SETTINGS, sanitizeWidgetDataSettings } from './useWidgetDataSettings'

describe('sanitizeWidgetDataSettings', () => {
  it('keeps valid stored values', () => {
    expect(sanitizeWidgetDataSettings({ enabled: false, animation: false })).toEqual({
      enabled: false,
      animation: false,
    })
  })

  it('falls back to defaults for missing or malformed values', () => {
    expect(sanitizeWidgetDataSettings(undefined)).toEqual(DEFAULT_WIDGET_DATA_SETTINGS)
    expect(sanitizeWidgetDataSettings({ enabled: 'no', animation: 1 })).toEqual(DEFAULT_WIDGET_DATA_SETTINGS)
  })
})

import { create } from 'zustand'
import { readSettings, writeSettingsSection } from '@/settings/settingsStorage'

interface WidgetDataSettingsValues {
  /** Off pauses widget data: widgets start from their defaults and nothing
   * new is saved. Data already saved is kept for when it comes back on. */
  enabled: boolean
  /** Off keeps the ring around the title bar icon still, even on a change. */
  animation: boolean
}

interface WidgetDataSettingsState extends WidgetDataSettingsValues {
  setEnabled: (enabled: boolean) => void
  setAnimation: (animation: boolean) => void
}

export const DEFAULT_WIDGET_DATA_SETTINGS: WidgetDataSettingsValues = { enabled: true, animation: true }

/** Keeps each stored value only when it still has the expected shape. */
export function sanitizeWidgetDataSettings(value: unknown): WidgetDataSettingsValues {
  const stored = (value ?? {}) as Partial<Record<keyof WidgetDataSettingsValues, unknown>>
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_WIDGET_DATA_SETTINGS.enabled,
    animation: typeof stored.animation === 'boolean' ? stored.animation : DEFAULT_WIDGET_DATA_SETTINGS.animation,
  }
}

/** Stored as the `widgetData` section of the grouped settings. */
export const useWidgetDataSettings = create<WidgetDataSettingsState>()((set) => ({
  ...sanitizeWidgetDataSettings(readSettings().widgetData),
  setEnabled: (enabled) => set({ enabled }),
  setAnimation: (animation) => set({ animation }),
}))

useWidgetDataSettings.subscribe(({ enabled, animation }) => writeSettingsSection('widgetData', { enabled, animation }))

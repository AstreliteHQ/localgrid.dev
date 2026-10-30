import { create } from 'zustand'
import { readSettings, writeSettingsSection } from '@/settings/settingsStorage'
import { DEFAULT_CONNECTOR_COLORS, connectionColor } from './connectionGraph'

export type ConveyorAnimation = 'hover' | 'always' | 'off'

interface ConnectorSettingsValues {
  /** Off hides every connector and pauses links, which are kept. */
  enabled: boolean
  animation: ConveyorAnimation
  /** Names the source on connected input fields, otherwise just a dot. */
  showSourceLabels: boolean
  colors: string[]
}

interface ConnectorSettingsState extends ConnectorSettingsValues {
  setEnabled: (enabled: boolean) => void
  setAnimation: (animation: ConveyorAnimation) => void
  setShowSourceLabels: (show: boolean) => void
  setColor: (index: number, color: string) => void
  resetColors: () => void
}

export const DEFAULT_CONNECTOR_SETTINGS: ConnectorSettingsValues = {
  enabled: true,
  animation: 'hover',
  showSourceLabels: true,
  colors: DEFAULT_CONNECTOR_COLORS,
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Keeps each stored value only when it still has the expected shape. */
export function sanitizeSettings(value: unknown): ConnectorSettingsValues {
  const stored = (value ?? {}) as Partial<Record<keyof ConnectorSettingsValues, unknown>>
  const colors = stored.colors
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_CONNECTOR_SETTINGS.enabled,
    animation:
      stored.animation === 'hover' || stored.animation === 'always' || stored.animation === 'off'
        ? stored.animation
        : DEFAULT_CONNECTOR_SETTINGS.animation,
    showSourceLabels:
      typeof stored.showSourceLabels === 'boolean'
        ? stored.showSourceLabels
        : DEFAULT_CONNECTOR_SETTINGS.showSourceLabels,
    colors:
      Array.isArray(colors) &&
      colors.length === DEFAULT_CONNECTOR_COLORS.length &&
      colors.every((color) => typeof color === 'string' && HEX_COLOR.test(color))
        ? colors
        : DEFAULT_CONNECTOR_COLORS,
  }
}

/** Stored as the `connectors` section of the grouped settings. */
export const useConnectorSettings = create<ConnectorSettingsState>()((set) => ({
  ...sanitizeSettings(readSettings().connectors),
  setEnabled: (enabled) => set({ enabled }),
  setAnimation: (animation) => set({ animation }),
  setShowSourceLabels: (showSourceLabels) => set({ showSourceLabels }),
  setColor: (index, color) =>
    set((state) => ({ colors: state.colors.map((current, i) => (i === index ? color : current)) })),
  resetColors: () => set({ colors: DEFAULT_CONNECTOR_COLORS }),
}))

useConnectorSettings.subscribe(({ enabled, animation, showSourceLabels, colors }) =>
  writeSettingsSection('connectors', { enabled, animation, showSourceLabels, colors }),
)

/** Color of the wires leaving `from`, from the user's palette. */
export function useConnectorColor(from: string | undefined): string | undefined {
  const colors = useConnectorSettings((state) => state.colors)
  return from === undefined ? undefined : connectionColor(from, colors)
}

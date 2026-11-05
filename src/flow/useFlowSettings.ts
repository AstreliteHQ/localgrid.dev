import { create } from 'zustand'
import { readSettings, writeSettingsSection } from '@/settings/settingsStorage'
import { DEFAULT_FLOW_COLORS, linkColor, type Link } from './linkGraph'

export type ConveyorAnimation = 'hover' | 'always' | 'off'

interface FlowSettingsValues {
  /** Off hides every tab, slot and wire and pauses links, which are kept. */
  enabled: boolean
  animation: ConveyorAnimation
  /** Names the source on connected input fields, otherwise just a dot. */
  showSourceLabels: boolean
  colors: string[]
}

interface FlowSettingsState extends FlowSettingsValues {
  setEnabled: (enabled: boolean) => void
  setAnimation: (animation: ConveyorAnimation) => void
  setShowSourceLabels: (show: boolean) => void
  setColor: (index: number, color: string) => void
  resetColors: () => void
}

export const DEFAULT_FLOW_SETTINGS: FlowSettingsValues = {
  enabled: true,
  animation: 'hover',
  showSourceLabels: true,
  colors: DEFAULT_FLOW_COLORS,
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Keeps each stored value only when it still has the expected shape. */
export function sanitizeSettings(value: unknown): FlowSettingsValues {
  const stored = (value ?? {}) as Partial<Record<keyof FlowSettingsValues, unknown>>
  const colors = stored.colors
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_FLOW_SETTINGS.enabled,
    animation:
      stored.animation === 'hover' || stored.animation === 'always' || stored.animation === 'off'
        ? stored.animation
        : DEFAULT_FLOW_SETTINGS.animation,
    showSourceLabels:
      typeof stored.showSourceLabels === 'boolean' ? stored.showSourceLabels : DEFAULT_FLOW_SETTINGS.showSourceLabels,
    colors:
      Array.isArray(colors) &&
      colors.length === DEFAULT_FLOW_COLORS.length &&
      colors.every((color) => typeof color === 'string' && HEX_COLOR.test(color))
        ? colors
        : DEFAULT_FLOW_COLORS,
  }
}

/** Stored as the `flow` section of the grouped settings. */
export const useFlowSettings = create<FlowSettingsState>()((set) => ({
  ...sanitizeSettings(readSettings().flow),
  setEnabled: (enabled) => set({ enabled }),
  setAnimation: (animation) => set({ animation }),
  setShowSourceLabels: (showSourceLabels) => set({ showSourceLabels }),
  setColor: (index, color) =>
    set((state) => ({ colors: state.colors.map((current, i) => (i === index ? color : current)) })),
  resetColors: () => set({ colors: DEFAULT_FLOW_COLORS }),
}))

useFlowSettings.subscribe(({ enabled, animation, showSourceLabels, colors }) =>
  writeSettingsSection('flow', { enabled, animation, showSourceLabels, colors }),
)

/** Color of a link from the user's palette (see `linkColor`). */
export function useLinkColor(link: Pick<Link, 'from' | 'color'> | undefined): string | undefined {
  const colors = useFlowSettings((state) => state.colors)
  return link && linkColor(link, colors)
}

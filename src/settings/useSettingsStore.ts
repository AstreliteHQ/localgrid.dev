import { create } from 'zustand'

export type SettingsSection = 'general' | 'share' | 'about'

interface SettingsState {
  open: boolean
  section: SettingsSection
  openSettings: (section?: SettingsSection) => void
  close: () => void
  setSection: (section: SettingsSection) => void
}

/** Standalone so both the toolbar button and the command palette's "Share"
 * action open the same dialog, the latter straight on the Share section. */
export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  section: 'general',
  openSettings: (section = 'general') => set({ open: true, section }),
  close: () => set({ open: false }),
  setSection: (section) => set({ section }),
}))

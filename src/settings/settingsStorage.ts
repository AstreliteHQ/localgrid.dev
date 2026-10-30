/** Every preference set in the Settings dialog lives under this one key, as
 * one section per feature. Each owner validates its own section on read.
 * The anti-flash scripts in index.html and about.html read `theme` from it. */
export const SETTINGS_STORAGE_KEY = 'localgrid.settings'

/** Stored values are untrusted: their owners validate them. */
export interface StoredSettings {
  theme?: unknown
  connectors?: unknown
}

/** Theme was stored on its own before settings were grouped. */
const LEGACY_THEME_KEY = 'localgrid.theme'

export function readSettings(): StoredSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw === null) return migrateLegacySettings()
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as StoredSettings) : {}
  } catch {
    return {}
  }
}

/** Replaces one section, keeping the others. */
export function writeSettingsSection<K extends keyof StoredSettings>(section: K, value: StoredSettings[K]) {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...readSettings(), [section]: value }))
  } catch {
    // Storage full or blocked: the setting still applies for this session.
  }
}

/** Moves a theme saved under the old key into the grouped settings, once. */
function migrateLegacySettings(): StoredSettings {
  const theme = window.localStorage.getItem(LEGACY_THEME_KEY)
  if (theme === null) return {}
  const settings: StoredSettings = { theme }
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  window.localStorage.removeItem(LEGACY_THEME_KEY)
  return settings
}

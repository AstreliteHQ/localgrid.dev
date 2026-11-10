import { create } from 'zustand'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { readSettings, writeSettingsSection } from '@/settings/settingsStorage'

export type Theme = 'light' | 'dark' | 'system'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Stored as the `theme` section of the grouped settings, which the
 * anti-flash scripts in index.html and about.html also read. */
function readStoredTheme(): Theme {
  const stored = readSettings().theme
  return isTheme(stored) ? stored : 'system'
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveIsDark(theme: Theme): boolean {
  return theme === 'system' ? prefersDark() : theme === 'dark'
}

/** Applies the resolved theme to the document — the `.dark` class Tailwind's
 * `dark:` variant now keys off of (see index.css), plus `color-scheme` so
 * native form controls and scrollbars follow the explicit choice too,
 * rather than only ever following the OS setting. */
function applyTheme(theme: Theme) {
  const isDark = resolveIsDark(theme)
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    writeSettingsSection('theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))

// The index.html bootstrap script already applied *a* theme before paint to
// avoid a flash, but re-apply here in case the two ever drift, and to pick
// up `color-scheme` if that script's try/catch swallowed an error.
applyTheme(useThemeStore.getState().theme)

// Keep the resolved theme in sync with OS-level changes while the user has
// explicitly chosen "system" rather than overriding it.
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') {
      applyTheme('system')
    }
  })

/** The live resolved light/dark boolean — reactive to both an explicit
 * theme choice *and* OS-level changes while on "system", unlike reading
 * `theme` alone. For anything that needs to pick between two JS-level style
 * objects rather than reaching for Tailwind's `dark:` variant — e.g.
 * CodeMirror's highlight styles, which are built in JS and so can't respond
 * to the `.dark` class on their own. */
export function useIsDarkTheme(): boolean {
  const theme = useThemeStore((state) => state.theme)
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  return theme === 'system' ? systemPrefersDark : theme === 'dark'
}

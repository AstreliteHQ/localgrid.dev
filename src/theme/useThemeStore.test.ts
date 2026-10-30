import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './useThemeStore'

describe('useThemeStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  it('setTheme("dark") adds the .dark class, sets color-scheme, and persists the choice', () => {
    useThemeStore.getState().setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(JSON.parse(window.localStorage.getItem('localgrid.settings') ?? '{}')).toMatchObject({ theme: 'dark' })
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('setTheme("light") removes the .dark class', () => {
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('setTheme("system") resolves against the OS preference rather than a fixed value', () => {
    useThemeStore.getState().setTheme('dark')
    useThemeStore.getState().setTheme('system')
    // src/test/setup.ts stubs matchMedia to always report matches: false.
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(useThemeStore.getState().theme).toBe('system')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'
import { useThemeStore } from './useThemeStore'

describe('ThemeToggle compact (mobile) button', () => {
  beforeEach(() => {
    useThemeStore.getState().setTheme('system')
  })

  it('steps through system, light and dark on each tap', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: /theme: system, switch to light/i }))
    expect(useThemeStore.getState().theme).toBe('light')

    await user.click(screen.getByRole('button', { name: /theme: light, switch to dark/i }))
    expect(useThemeStore.getState().theme).toBe('dark')

    await user.click(screen.getByRole('button', { name: /theme: dark, switch to system/i }))
    expect(useThemeStore.getState().theme).toBe('system')
  })
})

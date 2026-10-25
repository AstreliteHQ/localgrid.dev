import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useThemeStore } from '@/theme/useThemeStore'
import { SettingsDialog } from './SettingsDialog'
import { useSettingsStore } from './useSettingsStore'

beforeEach(() => {
  useThemeStore.getState().setTheme('system')
  useSettingsStore.setState({ open: false, section: 'general' })
  useDashboardStore.setState({
    dashboards: [
      {
        id: 'dash',
        name: 'Team',
        widgets: [
          {
            instanceId: 'clock',
            widgetId: 'world-clock',
            x: 0,
            y: 0,
            w: 5,
            h: 4,
            config: { selectedIds: ['paris', 'tokyo'] },
          },
        ],
      },
    ],
    activeDashboardId: 'dash',
  })
})

describe('SettingsDialog', () => {
  it('opens on General and changes the theme', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().openSettings()
    render(<SettingsDialog />)

    await user.click(screen.getByRole('button', { name: /dark/i }))

    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('switches sections from the left menu', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().openSettings()
    render(<SettingsDialog />)

    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(screen.getByText(/what to share/i)).toBeInTheDocument()
  })

  it('links to the repository and the about page from the About section', () => {
    useSettingsStore.getState().openSettings('about')
    render(<SettingsDialog />)

    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/AstreliteHQ/localgrid.dev',
    )
    expect(screen.getByRole('link', { name: /about page/i }).getAttribute('href')).toMatch(/about\.html$/)
  })

  it('shares only the address by default, and configuration only once layout is on', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().openSettings('share')
    render(<SettingsDialog />)

    const link = screen.getByRole('textbox', { name: /share link/i }) as HTMLInputElement
    const configToggle = screen.getByRole('checkbox', { name: /include widget configuration/i })
    expect(new URL(link.value).hash).toBe('')
    expect(screen.getByText(/link to localgrid only/i)).toBeInTheDocument()
    expect(configToggle).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /include layout/i }))

    expect(new URL(link.value).hash).toMatch(/^#layout=/)
    expect(screen.getByText('World Clock')).toBeInTheDocument()
    expect(screen.queryByText(/"paris"/)).not.toBeInTheDocument()

    await user.click(configToggle)

    expect(screen.getByText(/"paris"/)).toBeInTheDocument()
  })
})

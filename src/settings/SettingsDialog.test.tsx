import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConnectionStore } from '@/connectors/useConnectionStore'
import { useConnectorSettings } from '@/connectors/useConnectorSettings'
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

  it('shares the layout by default, configuration on demand, and the address alone without layout', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().openSettings('share')
    render(<SettingsDialog />)

    const link = screen.getByRole('textbox', { name: /share link/i }) as HTMLInputElement
    const layoutToggle = screen.getByRole('checkbox', { name: /include layout/i })
    const configToggle = screen.getByRole('checkbox', { name: /include widget configuration/i })
    expect(layoutToggle).toBeChecked()
    expect(new URL(link.value).hash).toMatch(/^#layout=/)
    expect(screen.getByText('World Clock')).toBeInTheDocument()
    expect(screen.queryByText(/"paris"/)).not.toBeInTheDocument()

    await user.click(configToggle)

    expect(screen.getByText(/"paris"/)).toBeInTheDocument()

    await user.click(layoutToggle)

    expect(new URL(link.value).hash).toBe('')
    expect(screen.getByText(/link to localgrid only/i)).toBeInTheDocument()
    expect(configToggle).toBeDisabled()
  })

  it('turns connectors off and edits a conveyor color from the Connectors section', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().openSettings('connectors')
    render(<SettingsDialog />)

    await user.click(screen.getByRole('checkbox', { name: /enable connectors/i }))
    expect(useConnectorSettings.getState().enabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Always' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: /enable connectors/i }))
    await user.click(screen.getByRole('button', { name: 'Always' }))
    expect(useConnectorSettings.getState().animation).toBe('always')
  })

  it('shares connectors when there are some, listed in the preview', async () => {
    const user = userEvent.setup()
    useDashboardStore.setState({
      dashboards: [
        {
          id: 'dash',
          name: 'Team',
          widgets: [
            { instanceId: 'src', widgetId: 'base64', x: 0, y: 0, w: 3, h: 3 },
            { instanceId: 'hash', widgetId: 'hash-generator', x: 3, y: 0, w: 3, h: 3 },
          ],
        },
      ],
      activeDashboardId: 'dash',
    })
    useConnectionStore.getState().connect('src', 'hash', 'input')
    useSettingsStore.getState().openSettings('share')
    render(<SettingsDialog />)

    const toggle = screen.getByRole('checkbox', { name: /include connectors/i })
    expect(toggle).toBeChecked()
    expect(screen.getByRole('list', { name: /shared connections/i })).toHaveTextContent('Base64 → Hash Generator')

    await user.click(toggle)

    expect(screen.queryByRole('list', { name: /shared connections/i })).not.toBeInTheDocument()
  })
})

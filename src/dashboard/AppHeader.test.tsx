import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Dashboard as DashboardType } from '@/types/layout'
import { AppHeader } from './AppHeader'
import { useDashboardStore } from './useDashboardStore'

function dashboardsWithWidgets(instanceId: string): DashboardType[] {
  return [
    { id: 'dash-a', name: 'Dashboard A', widgets: [{ instanceId, widgetId: 'base64', x: 0, y: 0, w: 2, h: 2 }] },
    { id: 'dash-b', name: 'Dashboard B', widgets: [] },
  ]
}

describe('AppHeader — clean dashboard button', () => {
  it('is disabled when the active dashboard has no widgets', () => {
    useDashboardStore.setState({ dashboards: dashboardsWithWidgets('reset-1'), activeDashboardId: 'dash-b' })
    render(<AppHeader />)

    expect(screen.getByRole('button', { name: /clean dashboard/i })).toBeDisabled()
  })

  it('is enabled when the active dashboard has widgets, but does nothing before confirming', async () => {
    const user = userEvent.setup()
    useDashboardStore.setState({ dashboards: dashboardsWithWidgets('reset-2'), activeDashboardId: 'dash-a' })
    render(<AppHeader />)

    const cleanButton = screen.getByRole('button', { name: /clean dashboard/i })
    expect(cleanButton).toBeEnabled()

    await user.click(cleanButton)
    expect(screen.getByRole('heading', { name: /clean this dashboard/i })).toBeInTheDocument()
    expect(useDashboardStore.getState().dashboards.find((d) => d.id === 'dash-a')!.widgets).toHaveLength(1)
  })

  it('cancelling the confirm dialog leaves every widget in place', async () => {
    const user = userEvent.setup()
    useDashboardStore.setState({ dashboards: dashboardsWithWidgets('reset-3'), activeDashboardId: 'dash-a' })
    render(<AppHeader />)

    await user.click(screen.getByRole('button', { name: /clean dashboard/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('heading', { name: /clean this dashboard/i })).not.toBeInTheDocument()
    expect(useDashboardStore.getState().dashboards.find((d) => d.id === 'dash-a')!.widgets).toHaveLength(1)
  })

  it('confirming removes every widget from the active dashboard only', async () => {
    const user = userEvent.setup()
    useDashboardStore.setState({
      dashboards: [
        {
          id: 'dash-a',
          name: 'Dashboard A',
          widgets: [
            { instanceId: 'reset-4a', widgetId: 'base64', x: 0, y: 0, w: 2, h: 2 },
            { instanceId: 'reset-4b', widgetId: 'json-formatter', x: 2, y: 0, w: 2, h: 2 },
          ],
        },
        { id: 'dash-b', name: 'Dashboard B', widgets: [{ instanceId: 'reset-4c', widgetId: 'notes', x: 0, y: 0, w: 2, h: 2 }] },
      ],
      activeDashboardId: 'dash-a',
    })
    render(<AppHeader />)

    await user.click(screen.getByRole('button', { name: /clean dashboard/i }))
    await user.click(screen.getByRole('button', { name: /^clean$/i }))

    const { dashboards } = useDashboardStore.getState()
    expect(dashboards.find((d) => d.id === 'dash-a')!.widgets).toEqual([])
    expect(dashboards.find((d) => d.id === 'dash-b')!.widgets).toHaveLength(1)
  })

  it('names the active dashboard in the confirmation copy', async () => {
    const user = userEvent.setup()
    useDashboardStore.setState({ dashboards: dashboardsWithWidgets('reset-5'), activeDashboardId: 'dash-a' })
    render(<AppHeader />)

    await user.click(screen.getByRole('button', { name: /clean dashboard/i }))

    const dialog = screen.getByRole('dialog', { name: /clean this dashboard/i })
    expect(within(dialog).getByText('Dashboard A')).toBeInTheDocument()
  })
})

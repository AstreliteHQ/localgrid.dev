import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { WidgetGridItem } from '@/dashboard/WidgetGridItem'
import { WidgetOverlay } from './WidgetOverlay'
import { useOverlayStore } from './useOverlayStore'

const DASHBOARD_ID = 'test-dashboard'

beforeEach(() => {
  useOverlayStore.setState({ target: null })
  useDashboardStore.setState({
    dashboards: [{ id: DASHBOARD_ID, name: 'Test', widgets: [] }],
    activeDashboardId: DASHBOARD_ID,
  })
})

describe('WidgetOverlay — adding an ephemeral tool with its current content', () => {
  it('offers an "Add to dashboard" button only for an ephemeral (unpinned) target', async () => {
    render(<WidgetOverlay>{null}</WidgetOverlay>)

    act(() => useOverlayStore.getState().openEphemeral('base64'))
    expect(await screen.findByRole('button', { name: /add base64 to dashboard/i })).toBeInTheDocument()

    act(() => useOverlayStore.getState().expandPinned('pinned-1', 'base64'))
    await screen.findByPlaceholderText(/text to encode/i)
    expect(screen.queryByRole('button', { name: /add base64 to dashboard/i })).not.toBeInTheDocument()
  })

  it('pins the ephemeral tool to the active dashboard with its current content, then closes the overlay', async () => {
    const user = userEvent.setup()
    render(<WidgetOverlay>{null}</WidgetOverlay>)

    act(() => useOverlayStore.getState().openEphemeral('base64'))
    const ephemeralInstanceId = useOverlayStore.getState().target!.instanceId

    await user.type(await screen.findByPlaceholderText(/text to encode/i), 'hello world')
    await user.click(screen.getByRole('button', { name: /add base64 to dashboard/i }))

    // The overlay closes once the tool is pinned.
    expect(useOverlayStore.getState().target).toBeNull()

    const { widgets } = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_ID)!
    expect(widgets).toHaveLength(1)
    expect(widgets[0]).toMatchObject({ instanceId: ephemeralInstanceId, widgetId: 'base64' })

    // Same instanceId, so the now-pinned grid cell reads the exact same
    // content the ephemeral preview already had — nothing was lost.
    render(<WidgetGridItem dashboardId={DASHBOARD_ID} instance={widgets[0]} onRemove={() => {}} editable={false} />)
    expect(screen.getByPlaceholderText(/text to encode/i)).toHaveValue('hello world')
  })
})

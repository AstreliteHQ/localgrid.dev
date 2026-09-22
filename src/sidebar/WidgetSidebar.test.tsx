import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useOverlayStore } from '@/overlay/useOverlayStore'
import { WidgetSidebar } from './WidgetSidebar'
import { useSidebarStore } from './useSidebarStore'

beforeEach(() => {
  useSidebarStore.setState({ collapsed: false })
  useOverlayStore.setState({ target: null })
})

describe('WidgetSidebar', () => {
  it('shows the full tool list, grouped by category, and narrows it as you type', async () => {
    render(<WidgetSidebar />)
    const user = userEvent.setup()

    expect(screen.getByText('JSON Formatter')).toBeInTheDocument()
    expect(screen.getByText('UUID Generator')).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/filter tools/i)
    await user.type(input, 'json')

    expect(screen.getByText('JSON Formatter')).toBeInTheDocument()
    expect(screen.queryByText('UUID Generator')).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    render(<WidgetSidebar />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText(/filter tools/i), 'nonexistent-tool-xyz')

    expect(screen.getByText(/no tools found/i)).toBeInTheDocument()
  })

  it('hides the search box and ignores any prior query when collapsed', () => {
    useSidebarStore.setState({ collapsed: true })
    render(<WidgetSidebar />)

    expect(screen.queryByPlaceholderText(/filter tools/i)).not.toBeInTheDocument()
    expect(screen.getByTitle('JSON Formatter')).toBeInTheDocument()
  })

  it('clicking a filtered row still opens it fullscreen without pinning it', async () => {
    render(<WidgetSidebar />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText(/filter tools/i), 'json')
    await user.click(screen.getByText('JSON Formatter'))

    expect(useOverlayStore.getState().target).toMatchObject({
      kind: 'ephemeral',
      widgetId: 'json-formatter',
    })
  })

  it('shows the app version discreetly in the footer', () => {
    render(<WidgetSidebar />)

    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument()
  })

  it('hides the version footer along with the rest of the brand footer when collapsed', () => {
    useSidebarStore.setState({ collapsed: true })
    render(<WidgetSidebar />)

    expect(screen.queryByText(/^v\d+\.\d+\.\d+$/)).not.toBeInTheDocument()
  })
})

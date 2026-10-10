import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useOverlayStore } from '@/overlay/useOverlayStore'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { CommandPalette } from './CommandPalette'
import { useCommandPaletteStore } from './useCommandPaletteStore'

beforeEach(() => {
  useCommandPaletteStore.setState({ open: false })
  useOverlayStore.setState({ target: null })
  useDashboardStore.setState({
    dashboards: [{ id: 'dash-a', name: 'A', widgets: [] }],
    activeDashboardId: 'dash-a',
  })
})

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    render(<CommandPalette />)
    expect(
      screen.queryByPlaceholderText(/search tools or actions/i),
    ).not.toBeInTheDocument()
  })

  it('shows the full tool list, grouped by category, and narrows it as you type', async () => {
    useCommandPaletteStore.setState({ open: true })
    render(<CommandPalette />)
    const user = userEvent.setup()

    expect(await screen.findByText('JSON Formatter')).toBeInTheDocument()
    expect(screen.getByText('UUID Generator')).toBeInTheDocument()
    // Category headings replace the old single flat "Open tool fullscreen" group.
    expect(screen.getByText('Formatting')).toBeInTheDocument()
    expect(screen.getByText('Generators')).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/search tools or actions/i)
    await user.type(input, 'json')

    expect(screen.getByText('JSON Formatter')).toBeInTheDocument()
    expect(screen.queryByText('UUID Generator')).not.toBeInTheDocument()
  })

  it('finds a widget by text that only appears in its description, not just its name or keywords', async () => {
    useCommandPaletteStore.setState({ open: true })
    render(<CommandPalette />)
    const user = userEvent.setup()

    await screen.findByText('Merge PDFs')
    const input = screen.getByPlaceholderText(/search tools or actions/i)
    // Not in "Merge PDFs"' own keywords (pdf, merge, combine, join,
    // concatenate) — only its description ever says this.
    await user.type(input, 'whatever order')

    expect(screen.getByText('Merge PDFs')).toBeInTheDocument()
    expect(screen.queryByText('UUID Generator')).not.toBeInTheDocument()
  })

  it('includes the always-available share action, but no separate "add a widget" indirection', () => {
    useCommandPaletteStore.setState({ open: true })
    render(<CommandPalette />)
    expect(screen.getByText(/share dashboard/i)).toBeInTheDocument()
    expect(screen.queryByText(/add a widget/i)).not.toBeInTheDocument()
  })

  it('selecting a widget row previews it fullscreen without pinning it', async () => {
    useCommandPaletteStore.setState({ open: true })
    render(<CommandPalette />)
    const user = userEvent.setup()

    await user.click(await screen.findByText('JSON Formatter'))

    expect(useOverlayStore.getState().target).toMatchObject({
      kind: 'ephemeral',
      widgetId: 'json-formatter',
    })
    expect(useDashboardStore.getState().dashboards[0].widgets).toHaveLength(0)
  })

  it('clicking a widget\'s Add button pins it to the active dashboard and closes the palette, without previewing it', async () => {
    useCommandPaletteStore.setState({ open: true })
    render(<CommandPalette />)
    const user = userEvent.setup()

    await screen.findByText('JSON Formatter')
    await user.click(screen.getByRole('button', { name: /add json formatter to dashboard/i }))

    const { dashboards } = useDashboardStore.getState()
    expect(dashboards[0].widgets).toHaveLength(1)
    expect(dashboards[0].widgets[0].widgetId).toBe('json-formatter')
    expect(useOverlayStore.getState().target).toBeNull()
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })
})

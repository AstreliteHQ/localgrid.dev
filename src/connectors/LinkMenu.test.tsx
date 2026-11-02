import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { LinkMenu } from './LinkMenu'
import { useConnectionStore } from './useConnectionStore'

beforeEach(() => {
  useDashboardStore.setState({
    dashboards: [
      {
        id: 'd',
        name: 'Test',
        widgets: [
          { instanceId: 'src', widgetId: 'base64', x: 0, y: 0, w: 3, h: 3 },
          { instanceId: 'hash', widgetId: 'hash-generator', x: 3, y: 0, w: 3, h: 3 },
        ],
      },
    ],
    activeDashboardId: 'd',
  })
  useConnectionStore.getState().connect('src', 'hash', 'input')
  useConnectionStore.getState().openLinkMenu({ key: 'hash:input', x: 100, y: 100 })
})

const linkNow = () => useConnectionStore.getState().connections[0]

describe('LinkMenu', () => {
  it('names the link and changes its color, or back to the source color', async () => {
    const user = userEvent.setup()
    render(<LinkMenu />)

    expect(screen.getByRole('dialog', { name: 'Connection' })).toHaveTextContent('Base64 → Hash Generator(Text)')
    expect(screen.getByRole('radio', { name: 'Source color' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Color 3' }))
    expect(linkNow().color).toBe(2)
    expect(screen.getByRole('radio', { name: 'Color 3' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Source color' }))
    expect(linkNow().color).toBeUndefined()
  })

  it('removes the link and closes', async () => {
    const user = userEvent.setup()
    render(<LinkMenu />)

    await user.click(screen.getByRole('button', { name: /remove connection/i }))

    expect(useConnectionStore.getState().connections).toEqual([])
    expect(useConnectionStore.getState().linkMenu).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

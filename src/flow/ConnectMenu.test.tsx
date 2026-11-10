import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import type { Dashboard } from '@/types/layout'
import { ConnectMenu } from './ConnectMenu'
import { useFlowStore } from './useFlowStore'

const dashboards: Dashboard[] = [
  {
    id: 'd1',
    name: 'One',
    widgets: [
      { instanceId: 'source', widgetId: 'base64', x: 0, y: 0, w: 3, h: 3 },
      { instanceId: 'hash', widgetId: 'hash-generator', x: 3, y: 0, w: 3, h: 3 },
      { instanceId: 'diff', widgetId: 'text-diff', x: 0, y: 3, w: 6, h: 5 },
      { instanceId: 'other-base64', widgetId: 'base64', x: 6, y: 0, w: 3, h: 3 },
    ],
  },
  { id: 'd2', name: 'Two', widgets: [{ instanceId: 'elsewhere', widgetId: 'hash-generator', x: 0, y: 0, w: 3, h: 3 }] },
]

beforeEach(() => {
  useDashboardStore.setState({ dashboards, activeDashboardId: 'd1' })
})

const open = () => act(() => useFlowStore.getState().openConnectMenu({ from: 'source', x: 0, y: 0 }))

describe('ConnectMenu', () => {
  it('lists every input on the same dashboard, numbering repeated widgets', () => {
    render(<ConnectMenu />)
    open()

    const rows = screen.getAllByRole('menuitemcheckbox').map((row) => row.textContent)
    expect(rows).toEqual(['Hash Generator(Text)', 'Base64 2(Text)', 'Text Diff(Original)', 'Text Diff(Changed)'])
  })

  it('connects a picked input, and disconnects it when picked again', async () => {
    const user = userEvent.setup()
    render(<ConnectMenu />)
    open()

    await user.click(screen.getByRole('menuitemcheckbox', { name: /Hash Generator/ }))
    expect(useFlowStore.getState().links).toEqual([{ from: 'source', to: 'hash', input: 'input' }])
    expect(useFlowStore.getState().connectMenu).toBeNull()

    open()
    const row = screen.getByRole('menuitemcheckbox', { name: /Hash Generator/ })
    expect(row).toHaveAttribute('aria-checked', 'true')
    await user.click(row)
    expect(useFlowStore.getState().links).toEqual([])
  })

  it('disables inputs that would close a loop', () => {
    act(() => useFlowStore.getState().connect('other-base64', 'source', 'input'))
    act(() => useFlowStore.getState().connect('source', 'hash', 'input'))
    render(<ConnectMenu />)
    open()

    expect(screen.getByRole('menuitemcheckbox', { name: /Base64 2/ })).toBeDisabled()
  })
})

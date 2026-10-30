import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import Base64Widget from '@/widgets/base64/Base64Widget'
import HashGeneratorWidget from '@/widgets/hash-generator/HashGeneratorWidget'
import TextDiffWidget from '@/widgets/text-diff/TextDiffWidget'
import { ConnectorInstanceContext } from './connectorsContext'
import { BURST_LIMIT, useConnectionStore } from './useConnectionStore'
import { useConnectorSettings } from './useConnectorSettings'

const valueOf = (instanceId: string, field = 'input') => useWidgetStateStore.getState().values[`${instanceId}:${field}`]

describe('useConnectionStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pushes the source output into the target input as soon as it connects', () => {
    const store = useConnectionStore.getState()
    store.publish('a', 'hello')

    expect(store.connect('a', 'b', 'input')).toBe(true)
    expect(valueOf('b')).toBe('hello')
  })

  it('forwards every new output to all connected targets', () => {
    const store = useConnectionStore.getState()
    store.connect('a', 'b', 'input')
    store.connect('a', 'c', 'input')

    store.publish('a', 'next')

    expect(valueOf('b')).toBe('next')
    expect(valueOf('c')).toBe('next')
  })

  it('feeds each declared input of one widget from its own source', () => {
    const store = useConnectionStore.getState()
    store.connect('a', 'diff', 'original')
    store.connect('b', 'diff', 'changed')

    store.publish('a', 'left')
    store.publish('b', 'right')

    expect(valueOf('diff', 'original')).toBe('left')
    expect(valueOf('diff', 'changed')).toBe('right')
  })

  it('refuses a loop and keeps a single link per input', () => {
    const store = useConnectionStore.getState()
    store.connect('a', 'b', 'input')
    store.connect('b', 'c', 'input')

    expect(store.connect('c', 'a', 'input')).toBe(false)
    store.connect('a', 'c', 'input')

    expect(useConnectionStore.getState().connections).toEqual([
      { from: 'a', to: 'b', input: 'input' },
      { from: 'a', to: 'c', input: 'input' },
    ])
  })

  it('disconnects one input and leaves the others', () => {
    const store = useConnectionStore.getState()
    store.connect('a', 'diff', 'original')
    store.connect('b', 'diff', 'changed')

    store.disconnect('diff', 'original')

    expect(useConnectionStore.getState().connections).toEqual([{ from: 'b', to: 'diff', input: 'changed' }])
  })

  it('cuts a link that writes faster than the burst limit', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = useConnectionStore.getState()
    store.connect('a', 'b', 'input')

    for (let i = 0; i <= BURST_LIMIT; i++) store.publish('a', `value-${i}`)

    expect(useConnectionStore.getState().connections).toEqual([])
    expect(console.warn).toHaveBeenCalledOnce()
  })

  it('pauses links while connectors are off and catches up when turned back on', () => {
    const store = useConnectionStore.getState()
    store.connect('a', 'b', 'input')
    useConnectorSettings.getState().setEnabled(false)

    store.publish('a', 'while off')
    expect(valueOf('b')).toBeUndefined()

    useConnectorSettings.getState().setEnabled(true)
    expect(valueOf('b')).toBe('while off')
  })

  it('drops links touching removed widgets', () => {
    const store = useConnectionStore.getState()
    store.connect('a', 'b', 'input')
    store.connect('b', 'c', 'input')

    store.removeInstances(['b'])

    expect(useConnectionStore.getState().connections).toEqual([])
  })
})

describe('connected widgets', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      dashboards: [
        {
          id: 'd',
          name: 'Test',
          widgets: [
            { instanceId: 'source', widgetId: 'base64', x: 0, y: 0, w: 3, h: 3 },
            { instanceId: 'target', widgetId: 'hash-generator', x: 3, y: 0, w: 3, h: 3 },
            { instanceId: 'diff', widgetId: 'text-diff', x: 0, y: 3, w: 6, h: 5 },
          ],
        },
      ],
      activeDashboardId: 'd',
    })
  })

  it('chains Base64 encode into a hash generator and names the source on the input', async () => {
    const user = userEvent.setup()
    useConnectionStore.getState().connect('source', 'target', 'input')
    render(
      <>
        <ConnectorInstanceContext.Provider value="source">
          <Base64Widget instanceId="source" mode="grid" />
        </ConnectorInstanceContext.Provider>
        <ConnectorInstanceContext.Provider value="target">
          <HashGeneratorWidget instanceId="target" mode="grid" />
        </ConnectorInstanceContext.Provider>
      </>,
    )

    await user.type(screen.getByPlaceholderText(/text to encode/i), 'hi')

    expect(screen.getByPlaceholderText(/text to hash/i)).toHaveValue(btoa('hi'))
    expect(screen.getByText('← Base64')).toBeInTheDocument()
  })

  it('shows the pushed value in the Text Diff line view', () => {
    useConnectionStore.getState().connect('source', 'diff', 'changed')
    render(
      <ConnectorInstanceContext.Provider value="diff">
        <TextDiffWidget instanceId="diff" mode="grid" />
      </ConnectorInstanceContext.Provider>,
    )

    act(() => useConnectionStore.getState().publish('source', 'from the wire'))

    expect(screen.getByRole('textbox', { name: 'Changed text' })).toHaveTextContent('from the wire')
  })

  it('marks the input and output fields only inside the editable grid', () => {
    const { container, rerender } = render(<Base64Widget instanceId="source" mode="overlay" />)
    expect(container.querySelector('[data-connector-slot]')).toBeNull()

    rerender(
      <ConnectorInstanceContext.Provider value="source">
        <Base64Widget instanceId="source" mode="grid" />
      </ConnectorInstanceContext.Provider>,
    )
    expect(container.querySelector('[data-connector-slot="input"]')).toBeInTheDocument()
    expect(container.querySelector('[data-connector-slot="output"]')).toBeInTheDocument()
  })
})

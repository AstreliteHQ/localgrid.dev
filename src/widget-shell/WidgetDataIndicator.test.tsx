import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetDataSettings } from '@/widgets/useWidgetDataSettings'
import { WidgetDataIndicator } from './WidgetDataIndicator'

const PLAYING = '[class*="animate-ring-play"]'

function arcs() {
  return screen.getByRole('button', { name: /has saved widget data/i }).querySelectorAll('circle')
}

beforeEach(() => {
  useDashboardStore.setState({
    dashboards: [
      {
        id: 'd',
        name: 'D',
        widgets: [
          { instanceId: 'clock', widgetId: 'world-clock', x: 0, y: 0, w: 5, h: 4, data: { selectedIds: ['paris'] } },
        ],
      },
    ],
    activeDashboardId: 'd',
  })
})

describe('WidgetDataIndicator', () => {
  it('stays still when it first shows saved data', () => {
    const { container } = render(<WidgetDataIndicator instanceId="clock" title="World Clock" />)

    expect(arcs()).toHaveLength(4)
    expect(container.querySelector(PLAYING)).toBeNull()
  })

  it('plays the ring once the data changes', () => {
    const { container } = render(<WidgetDataIndicator instanceId="clock" title="World Clock" />)

    act(() => useDashboardStore.getState().setWidgetData('clock', 'selectedIds', ['paris', 'tokyo']))

    expect(container.querySelectorAll(PLAYING)).toHaveLength(4)
  })

  it('does not play when the animation is turned off in Settings', () => {
    useWidgetDataSettings.getState().setAnimation(false)
    const { container } = render(<WidgetDataIndicator instanceId="clock" title="World Clock" />)

    act(() => useDashboardStore.getState().setWidgetData('clock', 'selectedIds', ['tokyo']))

    expect(container.querySelector(PLAYING)).toBeNull()
  })
})

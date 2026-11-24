import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OklchCharts } from './OklchCharts'

const COLOR = { l: 0.7, c: 0.15, h: 250, alpha: 1 }

function chart(fixed: 'l' | 'c' | 'h') {
  const element = screen.getByTestId(`oklch-chart-${fixed}`)
  element.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return element
}

describe('OklchCharts', () => {
  it('labels each chart with its fixed channel and value', () => {
    render(<OklchCharts color={COLOR} onChange={() => {}} />)
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('0.15')).toBeInTheDocument()
    expect(screen.getByText('250°')).toBeInTheDocument()
  })

  it('picks the color under the pointer and follows a drag', () => {
    const onChange = vi.fn()
    render(<OklchCharts color={COLOR} onChange={onChange} />)
    const hueChart = chart('h')

    fireEvent.pointerDown(hueChart, { clientX: 100, clientY: 50, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith({ l: 0.5, c: 0.2, h: 250, alpha: 1 })

    fireEvent.pointerMove(hueChart, { clientX: 150, clientY: 75, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith({ l: 0.75, c: 0.1, h: 250, alpha: 1 })

    fireEvent.pointerUp(hueChart, { pointerId: 1 })
    onChange.mockClear()
    fireEvent.pointerMove(hueChart, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves the color with the arrow keys, further with Shift', () => {
    const onChange = vi.fn()
    render(<OklchCharts color={COLOR} onChange={onChange} />)
    const lightnessChart = chart('l')

    fireEvent.keyDown(lightnessChart, { key: 'ArrowRight' })
    expect(onChange.mock.lastCall?.[0].h).toBeCloseTo(253.6)

    fireEvent.keyDown(lightnessChart, { key: 'ArrowUp', shiftKey: true })
    expect(onChange.mock.lastCall?.[0].c).toBeCloseTo(0.19)
  })
})

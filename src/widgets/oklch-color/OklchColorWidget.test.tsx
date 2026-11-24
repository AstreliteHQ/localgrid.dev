import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OklchColorWidget from './OklchColorWidget'

function colorField() {
  return screen.getByLabelText('Color')
}

function conversion(label: string) {
  return screen.getByRole('button', { name: `Copy ${label}` }).previousElementSibling?.textContent
}

describe('OklchColorWidget', () => {
  it('starts on the default color with every conversion filled in', () => {
    render(<OklchColorWidget instanceId="test" mode="grid" />)

    expect(colorField()).toHaveValue('oklch(70% 0.15 250)')
    expect(conversion('OKLCH')).toBe('oklch(70% 0.15 250)')
    expect(conversion('HEX')).toMatch(/^#[0-9a-f]{6}$/)
    expect(conversion('RGB')).toMatch(/^rgb\(/)
    expect(conversion('HSL')).toMatch(/^hsl\(/)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('converts a typed hex color to OKLCH and moves the sliders', async () => {
    const user = userEvent.setup()
    render(<OklchColorWidget instanceId="test" mode="grid" />)

    await user.clear(colorField())
    await user.type(colorField(), '#ff0000')

    expect(conversion('OKLCH')).toBe('oklch(62.8% 0.2577 29.23)')
    expect(conversion('HEX')).toBe('#ff0000')
    expect(screen.getByLabelText('Lightness value')).toHaveValue(62.8)
    expect(screen.getByLabelText('Hue value')).toHaveValue(29.23)
  })

  it('keeps the last valid color while the text does not parse', async () => {
    const user = userEvent.setup()
    render(<OklchColorWidget instanceId="test" mode="grid" />)

    await user.clear(colorField())
    await user.type(colorField(), 'oklch(50%')

    expect(screen.getByText(/not a color/i)).toBeInTheDocument()
    expect(conversion('OKLCH')).toBe('oklch(70% 0.15 250)')
  })

  it('writes channel edits back as an oklch() string', () => {
    render(<OklchColorWidget instanceId="test" mode="grid" />)

    fireEvent.change(screen.getByLabelText('Hue value'), { target: { value: '120' } })
    expect(colorField()).toHaveValue('oklch(70% 0.15 120)')

    fireEvent.change(screen.getByLabelText('Alpha value'), { target: { value: '50' } })
    expect(colorField()).toHaveValue('oklch(70% 0.15 120 / 0.5)')
  })

  it('warns when the color is outside sRGB and maps the sRGB formats', async () => {
    const user = userEvent.setup()
    render(<OklchColorWidget instanceId="test" mode="grid" />)

    await user.clear(colorField())
    await user.type(colorField(), 'oklch(65% 0.28 30)')

    expect(screen.getByRole('status')).toHaveTextContent(/outside srgb \(fits display p3\)/i)
    expect(screen.getByText('Outside', { exact: false, selector: '.sr-only' })).toBeInTheDocument()
    expect(conversion('OKLCH')).toBe('oklch(65% 0.28 30)')
    expect(conversion('HEX')).toMatch(/^#[0-9a-f]{6}$/)
  })

  describe('charts', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    /** Every observed element reports the given content size straight away. */
    function stubSize(width: number, height: number) {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          callback: ResizeObserverCallback
          constructor(callback: ResizeObserverCallback) {
            this.callback = callback
          }
          observe(target: Element) {
            this.callback([{ target, contentRect: { width, height } } as ResizeObserverEntry], this as never)
          }
          unobserve() {}
          disconnect() {}
        },
      )
    }

    it('shows the three charts once the widget is wide and tall enough', () => {
      stubSize(800, 500)
      render(<OklchColorWidget instanceId="test" mode="grid" />)
      expect(screen.getByTestId('oklch-chart-l')).toBeInTheDocument()
      expect(screen.getByTestId('oklch-chart-c')).toBeInTheDocument()
      expect(screen.getByTestId('oklch-chart-h')).toBeInTheDocument()
    })

    it('leaves them out when the widget is wide but short', () => {
      stubSize(800, 300)
      render(<OklchColorWidget instanceId="test" mode="grid" />)
      expect(screen.queryByTestId('oklch-chart-l')).not.toBeInTheDocument()
    })

    it('leaves them out when the widget is tall but narrow', () => {
      stubSize(400, 700)
      render(<OklchColorWidget instanceId="test" mode="grid" />)
      expect(screen.queryByTestId('oklch-chart-l')).not.toBeInTheDocument()
    })
  })
})

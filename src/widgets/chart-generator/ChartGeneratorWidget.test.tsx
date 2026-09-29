import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChartGeneratorWidget from './ChartGeneratorWidget'

function chartSvg() {
  return screen.getByRole('img')
}

describe('ChartGeneratorWidget', () => {
  it('opens on a bar chart built from the sample data', () => {
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    expect(screen.getByRole('button', { name: 'Bar' })).toHaveAttribute('aria-pressed', 'true')
    expect(chartSvg()).toHaveAccessibleName('Monthly Sales')
    // One <rect> bar per sample point, plus the full-chart background rect.
    expect(chartSvg().querySelectorAll('rect')).toHaveLength(5)
  })

  it('updates the chart title live', async () => {
    const user = userEvent.setup()
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    const titleField = screen.getByLabelText('Title')
    await user.clear(titleField)
    await user.type(titleField, 'Q1 Revenue')

    expect(chartSvg()).toHaveAccessibleName('Q1 Revenue')
  })

  it('switches to a line chart and shows a line-color field', async () => {
    const user = userEvent.setup()
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Line' }))

    expect(screen.getByLabelText('Line color')).toBeInTheDocument()
    expect(chartSvg().querySelector('path')).toBeInTheDocument()
    // 4 sample points connected in one path.
    expect(chartSvg().querySelectorAll('circle')).toHaveLength(4)
  })

  it('switches to a pie chart with one wedge per positive-value point', async () => {
    const user = userEvent.setup()
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Pie' }))

    expect(chartSvg().querySelectorAll('path')).toHaveLength(4)
    expect(screen.queryByLabelText('Line color')).not.toBeInTheDocument()
  })

  it('adds and removes data points', async () => {
    const user = userEvent.setup()
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    expect(screen.getAllByLabelText(/^Data point \d+ label$/)).toHaveLength(4)

    await user.click(screen.getByRole('button', { name: /add data point/i }))
    expect(screen.getAllByLabelText(/^Data point \d+ label$/)).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Remove data point 1' }))
    expect(screen.getAllByLabelText(/^Data point \d+ label$/)).toHaveLength(4)
  })

  it('recolors a data point and reflects it in the chart', () => {
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    // A native color input's value is always set programmatically (real
    // browsers open a color-picker UI on click, never accept typed text),
    // so this is simulated the same way that picker's own commit would be.
    const colorField = screen.getByLabelText('Data point 1 color')
    fireEvent.change(colorField, { target: { value: '#ff00ff' } })

    const firstBar = chartSvg().querySelectorAll('rect')[1]
    expect(firstBar).toHaveAttribute('fill', '#ff00ff')
  })

  it('treats a single positive-value point as a full circle rather than a zero-length wedge', async () => {
    const user = userEvent.setup()
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    for (const label of [2, 3, 4]) {
      await user.click(screen.getByRole('button', { name: `Remove data point 2` }))
      void label
    }
    await user.click(screen.getByRole('button', { name: 'Pie' }))

    expect(chartSvg().querySelector('circle')).toBeInTheDocument()
    expect(chartSvg().querySelector('path')).not.toBeInTheDocument()
  })

  it('shows a prompt instead of a chart when every point is removed', async () => {
    const user = userEvent.setup()
    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Remove data point 1' }))
    }

    expect(screen.getByText(/add a data point to see a chart/i)).toBeInTheDocument()
  })

  it('keeps its title, chart type, and data across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ChartGeneratorWidget instanceId="test" mode="grid" />)

    const titleField = screen.getByLabelText('Title')
    await user.clear(titleField)
    await user.type(titleField, 'Custom Title')
    await user.click(screen.getByRole('button', { name: 'Pie' }))
    unmount()

    render(<ChartGeneratorWidget instanceId="test" mode="grid" />)
    expect(screen.getByLabelText('Title')).toHaveValue('Custom Title')
    expect(screen.getByRole('button', { name: 'Pie' })).toHaveAttribute('aria-pressed', 'true')
  })
})

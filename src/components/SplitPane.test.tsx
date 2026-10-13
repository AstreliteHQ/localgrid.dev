import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SplitPane } from './SplitPane'

describe('SplitPane', () => {
  it('renders no divider without a second pane', () => {
    render(<SplitPane direction="rows" ratio={0.5} onRatioChange={() => {}} first={<p>one</p>} second={false} />)

    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('nudges the ratio with the arrow keys matching its direction', () => {
    const onRatioChange = vi.fn()
    render(
      <SplitPane direction="columns" ratio={0.5} onRatioChange={onRatioChange} first={<p>a</p>} second={<p>b</p>} />,
    )
    const separator = screen.getByRole('separator')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(onRatioChange).toHaveBeenLastCalledWith(0.55)

    fireEvent.keyDown(separator, { key: 'ArrowUp' })
    expect(onRatioChange).toHaveBeenCalledTimes(1)
  })

  it('clamps the ratio and resets it on Enter', () => {
    const onRatioChange = vi.fn()
    render(<SplitPane direction="rows" ratio={0.84} onRatioChange={onRatioChange} first={<p>a</p>} second={<p>b</p>} />)
    const separator = screen.getByRole('separator')

    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    expect(onRatioChange).toHaveBeenLastCalledWith(0.85)

    fireEvent.keyDown(separator, { key: 'Enter' })
    expect(onRatioChange).toHaveBeenLastCalledWith(0.5)
  })
})

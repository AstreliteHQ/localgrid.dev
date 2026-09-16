import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import ComplexityEstimatorWidget from './ComplexityEstimatorWidget'
import { MAX_SOURCE_LENGTH } from './analyze'

function editor() {
  return screen.getByRole('textbox', { name: 'Code snippet' })
}

function paste(source: string) {
  setCodeMirrorValue(editor(), source)
}

/** The verdict, as opposed to the same notation repeated in the findings
 * list below it. */
function verdict() {
  return within(screen.getByRole('status', { name: 'Estimated complexity' })).getByText(/^O\(/)
}

describe('ComplexityEstimatorWidget', () => {
  it('opens on a sample snippet and already has a verdict', () => {
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)
    expect(verdict()).toHaveTextContent('O(n²)')
    expect(screen.getByText(/quadruples/i)).toBeInTheDocument()
  })

  it('re-estimates as the snippet changes', () => {
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)

    paste('function sum(items) { let total = 0; for (const item of items) total += item; return total }')
    expect(verdict()).toHaveTextContent('O(n)')

    paste('function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }')
    expect(verdict()).toHaveTextContent('O(2^n)')
  })

  it('lists the lines that drive the verdict', () => {
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)

    paste(`function pairs(items) {
  for (const a of items) {
    for (const b of items) { work(a, b) }
  }
}`)

    const worst = screen.getAllByRole('listitem')[0]
    expect(within(worst).getByText('2')).toBeInTheDocument()
    expect(within(worst).getByText(/for loop/i)).toBeInTheDocument()
    expect(within(worst).getByText('O(n²)')).toBeInTheDocument()
  })

  it('reports each named function on its own tab', async () => {
    const user = userEvent.setup()
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)

    paste(`function scan(items) { for (const item of items) work(item) }
function sortAll(items) { return items.sort() }`)

    await user.click(screen.getByRole('button', { name: /functions \(2\)/i }))
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('scan')).toBeInTheDocument()
    expect(within(rows[0]).getByText('O(n)')).toBeInTheDocument()
    expect(within(rows[1]).getByText('sortAll')).toBeInTheDocument()
    expect(within(rows[1]).getByText('O(n log n)')).toBeInTheDocument()
  })

  it('always states that the estimate reads the code shape', () => {
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/estimate read from the code's shape/i)).toBeInTheDocument()
  })

  it('shows the character count and refuses a snippet past the limit', () => {
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)
    expect(
      screen.getByText(new RegExp(`/ ${MAX_SOURCE_LENGTH.toLocaleString('en-US')} characters`)),
    ).toBeInTheDocument()

    paste('const a = 1\n'.repeat(Math.ceil(MAX_SOURCE_LENGTH / 12) + 1))

    expect(screen.getByText(/the limit is 20,000/i)).toBeInTheDocument()
    expect(screen.queryByText(/^O\(/)).not.toBeInTheDocument()
  })

  it('invites a snippet when the editor is emptied', () => {
    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)
    paste('')
    expect(screen.getByText(/paste a function to estimate/i)).toBeInTheDocument()
  })

  it('keeps the snippet and the open tab across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)

    paste('function once(items) { return items.length }')
    await user.click(screen.getByRole('button', { name: /functions/i }))
    unmount()

    render(<ComplexityEstimatorWidget instanceId="test" mode="grid" />)
    expect(screen.getByRole('button', { name: /functions/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('once')).toBeInTheDocument()
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import CsvViewerWidget from './CsvViewerWidget'

function csvField() {
  return screen.getByRole('textbox', { name: /csv input/i })
}

describe('CsvViewerWidget', () => {
  it('renders the sample CSV it opens with as a table, header included', () => {
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'name' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'salary' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Ada Lovelace' })).toBeInTheDocument()
    expect(screen.getByText(/3 rows × 4 columns/i)).toBeInTheDocument()
  })

  it('shows a placeholder instead of a table once the input is cleared', () => {
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(csvField(), '')

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/paste csv above/i)).toBeInTheDocument()
  })

  it('lets the delimiter be picked by hand, overriding auto-detection', async () => {
    const user = userEvent.setup()
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    // One comma, one semicolon — auto-detect ties and favors comma, so this
    // starts out split as "one" | "two;three".
    setCodeMirrorValue(csvField(), 'one,two;three')
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'two;three' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: ';' }))

    expect(within(table).getByRole('columnheader', { name: 'one,two' })).toBeInTheDocument()
  })

  it('treats every row as data, with synthetic column headers, once "First row is header" is unchecked', async () => {
    const user = userEvent.setup()
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(csvField(), 'a,b\n1,2')
    await user.click(screen.getByRole('checkbox', { name: /first row is header/i }))

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Column 1' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'a' })).toBeInTheDocument()
    expect(screen.getByText(/2 rows × 2 columns/i)).toBeInTheDocument()
  })

  it('caps the rendered rows and says so for a very large paste', () => {
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    const manyRows = Array.from({ length: 1005 }, (_, i) => `row${i},${i}`).join('\n')
    setCodeMirrorValue(csvField(), `id,value\n${manyRows}`)

    expect(screen.getByText(/showing the first 1,000 of 1,005 rows/i)).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1000) // header row + capped data rows
  })

  it('keeps its CSV and settings across a remount of the same instance', () => {
    const { unmount } = render(<CsvViewerWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(csvField(), 'x,y\n1,2')
    unmount()

    render(<CsvViewerWidget instanceId="test" mode="grid" />)
    expect(csvField()).toHaveTextContent('x,y1,2')
  })
})

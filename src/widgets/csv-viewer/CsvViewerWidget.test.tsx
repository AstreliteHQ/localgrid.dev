import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import CsvViewerWidget from './CsvViewerWidget'

function csvField() {
  return screen.getByRole('textbox', { name: /csv input/i })
}

/** jsdom implements neither the Clipboard nor ClipboardItem write path, so
 * stub both the way QrCodeWidget.test.tsx stubs its own image-copy button. */
function stubClipboard() {
  const write = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      items: Record<string, Blob>
      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    },
  )
  return write
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

  it('splits on a hand-typed custom delimiter', async () => {
    const user = userEvent.setup()
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(csvField(), 'a|b\n1|2')
    await user.click(screen.getByRole('button', { name: /custom/i }))
    await user.type(screen.getByRole('textbox', { name: /custom delimiter character/i }), '|')

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'a' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'b' })).toBeInTheDocument()
    expect(screen.getByText(/1 row × 2 columns/i)).toBeInTheDocument()
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

  it('copies the table to the clipboard as HTML with a tab-separated text fallback', async () => {
    // userEvent.setup() installs its own clipboard stub, so the real
    // clipboard override below has to come after it or userEvent clobbers
    // it right back.
    const user = userEvent.setup()
    const write = stubClipboard()
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(csvField(), 'name,role\nAda,Engineer')
    await user.click(screen.getByRole('button', { name: /copy table/i }))

    expect(write).toHaveBeenCalledTimes(1)
    const [clipboardItem] = write.mock.calls[0][0]
    const html = await clipboardItem.items['text/html'].text()
    const text = await clipboardItem.items['text/plain'].text()
    expect(html).toContain('<table>')
    expect(html).toContain('Ada')
    expect(text).toBe('name\trole\nAda\tEngineer')
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows a failure state when the clipboard write is rejected', async () => {
    const user = userEvent.setup()
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        items: Record<string, Blob>
        constructor(items: Record<string, Blob>) {
          this.items = items
        }
      },
    )
    render(<CsvViewerWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /copy table/i }))

    expect(await screen.findByRole('button', { name: /copy failed/i })).toBeInTheDocument()
  })
})

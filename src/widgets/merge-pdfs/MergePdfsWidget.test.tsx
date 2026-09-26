import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PDFDocument } from 'pdf-lib'
import MergePdfsWidget from './MergePdfsWidget'

beforeEach(() => {
  // jsdom has no object-URL implementation at all.
  URL.createObjectURL = () => 'blob:mock-url'
  URL.revokeObjectURL = () => {}
})

async function makePdf(name: string, pageCount: number): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([100, 100])
  const bytes = await doc.save()
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

function notAPdf(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' })
}

/** jsdom builds no real DataTransfer, so the drop event carries the
 * minimum shape the widget reads off it. */
function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByLabelText('PDF drop zone'), { dataTransfer: { files } })
}

function fileRow(name: string) {
  return screen.getByText(name).closest('li') as HTMLLIElement
}

function mergeButton() {
  return screen.getByRole('button', { name: /^merge \d+ files?$/i })
}

describe('MergePdfsWidget', () => {
  it('starts on an empty drop zone', () => {
    render(<MergePdfsWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/drop pdfs here/i)).toBeInTheDocument()
  })

  it('lists dropped files in the order they were dropped, with each one’s page count', async () => {
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 2), await makePdf('b.pdf', 3)])

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('a.pdf')).toBeInTheDocument()
    expect(within(rows[1]).getByText('b.pdf')).toBeInTheDocument()
    expect(await within(rows[0]).findByText('2 pg')).toBeInTheDocument()
    expect(await within(rows[1]).findByText('3 pg')).toBeInTheDocument()
  })

  it('disables merging until there are at least two files', async () => {
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1)])

    expect(await screen.findByText('1 pg')).toBeInTheDocument()
    expect(mergeButton()).toBeDisabled()
  })

  it('merges every file into one download, reporting the combined page count', async () => {
    const user = userEvent.setup()
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 2), await makePdf('b.pdf', 3)])
    await screen.findByText('2 pg')
    await screen.findByText('3 pg')

    await user.click(mergeButton())

    const download = await screen.findByRole('link', { name: /download merged\.pdf \(5 pages\)/i })
    expect(download).toHaveAttribute('download', 'merged.pdf')
  })

  it('downloads under a custom name when one is typed in', async () => {
    const user = userEvent.setup()
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), await makePdf('b.pdf', 1)])
    await waitFor(() => expect(mergeButton()).toBeEnabled())

    await user.clear(screen.getByLabelText('Output file name'))
    await user.type(screen.getByLabelText('Output file name'), 'quarterly-report')
    await user.click(mergeButton())

    const download = await screen.findByRole('link', { name: /download quarterly-report\.pdf/i })
    expect(download).toHaveAttribute('download', 'quarterly-report.pdf')
  })

  it('falls back to the default name when the typed name is blank or unsafe', async () => {
    const user = userEvent.setup()
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), await makePdf('b.pdf', 1)])
    await waitFor(() => expect(mergeButton()).toBeEnabled())

    await user.clear(screen.getByLabelText('Output file name'))
    await user.type(screen.getByLabelText('Output file name'), '///')
    await user.click(mergeButton())

    const download = await screen.findByRole('link', { name: /download merged\.pdf/i })
    expect(download).toHaveAttribute('download', 'merged.pdf')
  })

  it('moves a file up or down the list, re-ordering the eventual merge', async () => {
    const user = userEvent.setup()
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), await makePdf('b.pdf', 1)])
    await waitFor(() => expect(mergeButton()).toBeEnabled())

    await user.click(within(fileRow('b.pdf')).getByRole('button', { name: /move b\.pdf up/i }))

    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('b.pdf')).toBeInTheDocument()
    expect(within(rows[1]).getByText('a.pdf')).toBeInTheDocument()
  })

  it('removes a file, dropping the merge button back below two files', async () => {
    const user = userEvent.setup()
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), await makePdf('b.pdf', 1)])
    await waitFor(() => expect(mergeButton()).toBeEnabled())

    await user.click(within(fileRow('b.pdf')).getByRole('button', { name: /remove b\.pdf/i }))

    expect(screen.queryByText('b.pdf')).not.toBeInTheDocument()
    expect(mergeButton()).toBeDisabled()
  })

  it('flags a file that is not a readable PDF and keeps merging disabled', async () => {
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), notAPdf('broken.pdf')])
    await screen.findByRole('img', { name: /isn't a readable pdf/i })

    expect(mergeButton()).toBeDisabled()
  })

  it('clears every file and any prior result on "Clear all"', async () => {
    const user = userEvent.setup()
    render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), await makePdf('b.pdf', 1)])
    await waitFor(() => expect(mergeButton()).toBeEnabled())
    await user.click(mergeButton())
    await screen.findByRole('link', { name: /download merged\.pdf/i })

    await user.click(screen.getByRole('button', { name: /clear all/i }))

    expect(screen.getByText(/drop pdfs here/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download merged\.pdf/i })).not.toBeInTheDocument()
  })

  it('keeps its file list across a remount of the same instance', async () => {
    const { unmount } = render(<MergePdfsWidget instanceId="test" mode="grid" />)

    dropFiles([await makePdf('a.pdf', 1), await makePdf('b.pdf', 1)])
    await screen.findByText('b.pdf')
    unmount()

    render(<MergePdfsWidget instanceId="test" mode="grid" />)
    expect(screen.getByText('a.pdf')).toBeInTheDocument()
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
    // Lets this remount's own (freshly re-run) detection effects settle
    // before the test ends, so their state updates don't land after
    // cleanup and warn about a missing act().
    await waitFor(() => expect(mergeButton()).toBeEnabled())
  })
})

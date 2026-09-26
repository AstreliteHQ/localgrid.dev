import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PDFDocument } from 'pdf-lib'
import SplitPdfWidget from './SplitPdfWidget'

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
function dropFile(file: File) {
  fireEvent.drop(screen.getByLabelText('PDF drop zone'), { dataTransfer: { files: [file] } })
}

function splitButton() {
  return screen.getByRole('button', { name: /^split$/i })
}

describe('SplitPdfWidget', () => {
  it('starts on an empty drop zone', () => {
    render(<SplitPdfWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/drop a pdf here/i)).toBeInTheDocument()
  })

  it('shows the page count once a dropped file is read', async () => {
    render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf('a.pdf', 5))

    expect(await screen.findByText('5 pg')).toBeInTheDocument()
  })

  it('flags a file that is not a readable PDF', async () => {
    render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(notAPdf('broken.pdf'))

    expect(await screen.findByText(/isn't a readable pdf/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^split$/i })).not.toBeInTheDocument()
  })

  it('splits into one PDF per page by default', async () => {
    const user = userEvent.setup()
    render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf('a.pdf', 3))
    await screen.findByText('3 pg')

    await user.click(splitButton())

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('page-1.pdf')).toBeInTheDocument()
    expect(within(rows[2]).getByText('page-3.pdf')).toBeInTheDocument()
  })

  it('splits by custom page ranges once switched to that mode', async () => {
    const user = userEvent.setup()
    render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf('a.pdf', 9))
    await screen.findByText('9 pg')

    await user.click(screen.getByRole('button', { name: 'Custom ranges' }))
    await user.type(screen.getByPlaceholderText(/e\.g\. 1-3, 5, 7-9/i), '1-3, 5, 7-9')
    await user.click(splitButton())

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('pages-1-3.pdf')).toBeInTheDocument()
    expect(within(rows[0]).getByText('3 pgs')).toBeInTheDocument()
    expect(within(rows[1]).getByText('page-5.pdf')).toBeInTheDocument()
    expect(within(rows[2]).getByText('pages-7-9.pdf')).toBeInTheDocument()
  })

  it('disables splitting and shows an error for an out-of-range custom ranges input', async () => {
    const user = userEvent.setup()
    render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf('a.pdf', 3))
    await screen.findByText('3 pg')
    await user.click(screen.getByRole('button', { name: 'Custom ranges' }))

    await user.type(screen.getByPlaceholderText(/e\.g\. 1-3, 5, 7-3/i), '1-9')

    expect(await screen.findByText(/outside this pdf's 3 pages/i)).toBeInTheDocument()
    expect(splitButton()).toBeDisabled()
  })

  it('removing the file clears the page count and any prior split result', async () => {
    const user = userEvent.setup()
    render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf('a.pdf', 2))
    await screen.findByText('2 pg')
    await user.click(splitButton())
    await screen.findAllByRole('listitem')

    await user.click(screen.getByRole('button', { name: /remove file/i }))

    expect(screen.getByText(/drop a pdf here/i)).toBeInTheDocument()
  })

  it('keeps its file and settings across a remount of the same instance', async () => {
    const { unmount } = render(<SplitPdfWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf('a.pdf', 4))
    await screen.findByText('4 pg')
    unmount()

    render(<SplitPdfWidget instanceId="test" mode="grid" />)
    expect(screen.getByText('a.pdf')).toBeInTheDocument()
    await waitFor(() => expect(splitButton()).toBeEnabled())
  })
})

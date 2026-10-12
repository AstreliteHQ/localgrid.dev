import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotesWidget from './NotesWidget'
import { setCodeMirrorValue } from '@/test/codemirror'

/** Mirrors StatisticsCalculatorWidget's own test helper — several labels
 * can share a value (e.g. both zero), so scope each assertion to its row
 * rather than asserting the value text is unique on the page. */
function statValue(label: string): string | null {
  const labelEl = screen.getByText(label)
  const row = labelEl.closest('div')
  if (!row) throw new Error(`no row found for label "${label}"`)
  return within(row).getAllByText(/./).at(-1)?.textContent ?? null
}

function imageFile(name: string, type = 'image/png'): File {
  return new File([new Uint8Array(8)], name, { type })
}

/** jsdom builds no real DataTransfer, so the drop event carries the
 * minimum shape the widget reads off it — mirrors
 * ImageConverterWidget.test.tsx's own `dropFile` helper. */
function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByLabelText('Image attachments'), { dataTransfer: { types: ['Files'], files } })
}

/** Same idea for a paste: jsdom's ClipboardEvent carries no real
 * DataTransfer either, so the event is given the minimum `files` shape
 * NotesWidget's own paste handler reads off it — plus a no-op `getData`,
 * since CodeMirror's own native paste handler (on the Notes textbox
 * itself) reads that unconditionally and would throw without it, unlike a
 * real browser's DataTransfer which always has one. */
function pasteFiles(files: File[], target: HTMLElement = screen.getByRole('textbox', { name: 'Notes' })) {
  fireEvent.paste(target, { clipboardData: { files, getData: () => '' } })
}

describe('NotesWidget', () => {
  it('starts with the statistics panel collapsed', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)

    expect(screen.queryByText('Characters')).not.toBeInTheDocument()
  })

  it('starts empty with every statistic at zero, once expanded', async () => {
    const user = userEvent.setup()
    render(<NotesWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Statistics' }))

    expect(statValue('Characters')).toBe('0')
    expect(statValue('Words')).toBe('0')
    expect(statValue('Lines')).toBe('0')
    expect(statValue('Paragraphs')).toBe('0')
    expect(statValue('Sentences')).toBe('0')
    expect(statValue('Reading time')).toBe('0 min')
  })

  it('recomputes statistics as the note is edited', async () => {
    const user = userEvent.setup()
    render(<NotesWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Statistics' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: 'Notes' }), 'The quick brown fox\njumps over the lazy dog.')

    expect(statValue('Characters')).toBe('44')
    expect(statValue('No spaces')).toBe('36')
    expect(statValue('Words')).toBe('9')
    expect(statValue('Lines')).toBe('2')
    expect(statValue('Sentences')).toBe('1')
    expect(statValue('Reading time')).toBe('1 min')
  })

  it('toggles the statistics rows open and closed', async () => {
    const user = userEvent.setup()
    render(<NotesWidget instanceId="test" mode="grid" />)

    expect(screen.queryByText('Characters')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Statistics' }))

    expect(screen.getByText('Characters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Statistics' }))

    expect(screen.queryByText('Characters')).not.toBeInTheDocument()
  })
})

describe('NotesWidget image attachments', () => {
  beforeEach(() => {
    // jsdom has no object-URL implementation at all.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  it('shows a hint and no thumbnails when nothing is attached', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/drop images here, paste a screenshot/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('attaches a dropped image as a thumbnail', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)

    dropFiles([imageFile('screenshot.png')])

    expect(screen.getByRole('img', { name: 'screenshot.png' })).toBeInTheDocument()
    expect(screen.queryByText(/drop images here/i)).not.toBeInTheDocument()
  })

  it('attaches multiple dropped images at once', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)

    dropFiles([imageFile('a.png'), imageFile('b.jpg', 'image/jpeg')])

    expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'b.jpg' })).toBeInTheDocument()
  })

  it('attaches an image pasted while the notes editor has focus', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)

    pasteFiles([imageFile('clipboard.png')])

    expect(screen.getByRole('img', { name: 'clipboard.png' })).toBeInTheDocument()
  })

  it('does not intercept a normal text paste (no image files on the clipboard)', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)

    fireEvent.paste(screen.getByRole('textbox', { name: 'Notes' }), {
      clipboardData: { files: [], getData: () => 'some pasted text' },
    })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('attaches an image chosen through the file picker', async () => {
    const user = userEvent.setup()
    render(<NotesWidget instanceId="test" mode="grid" />)

    await user.upload(screen.getByLabelText('Choose image files'), imageFile('picked.png'))

    expect(screen.getByRole('img', { name: 'picked.png' })).toBeInTheDocument()
  })

  it('rejects a non-image file with a visible error, attaching nothing', () => {
    render(<NotesWidget instanceId="test" mode="grid" />)

    dropFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })])

    expect(screen.getByText(/notes\.txt is not an image/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('removes an attached image', async () => {
    const user = userEvent.setup()
    render(<NotesWidget instanceId="test" mode="grid" />)

    dropFiles([imageFile('screenshot.png')])
    expect(screen.getByRole('img', { name: 'screenshot.png' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove screenshot.png' }))

    expect(screen.queryByRole('img', { name: 'screenshot.png' })).not.toBeInTheDocument()
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument()
  })

  it('keeps attached images across a remount of the same instance', () => {
    const { unmount } = render(<NotesWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('screenshot.png')])
    unmount()

    render(<NotesWidget instanceId="test" mode="grid" />)
    expect(screen.getByRole('img', { name: 'screenshot.png' })).toBeInTheDocument()
  })
})

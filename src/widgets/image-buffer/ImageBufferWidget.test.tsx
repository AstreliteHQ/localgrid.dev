import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toPngBlob } from '@/widgets/image-converter/convertImage'
import ImageBufferWidget from './ImageBufferWidget'

// toPngBlob wraps createImageBitmap/<canvas> plumbing jsdom can't run; every
// blob in these tests is already PNG-like, so a passthrough is what the real
// one would return too.
vi.mock('@/widgets/image-converter/convertImage', () => ({ toPngBlob: vi.fn() }))
const mockedToPngBlob = vi.mocked(toPngBlob)

beforeEach(() => {
  mockedToPngBlob.mockReset().mockImplementation(async (blob) => blob)
  // jsdom has no object-URL implementation at all.
  let counter = 0
  URL.createObjectURL = vi.fn(() => `blob:mock-url-${++counter}`)
  URL.revokeObjectURL = vi.fn()
})

function imageFile(name: string, type = 'image/png'): File {
  return new File([new Uint8Array(8)], name, { type })
}

/** jsdom builds no real DataTransfer, so the drop event carries the minimum
 * shape the widget reads off it. */
function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByLabelText(/^Image drop zone/), { dataTransfer: { types: ['Files'], files } })
}

/** Same idea for a paste, fired on the focusable drop zone. */
function pasteFiles(files: File[], text = '') {
  fireEvent.paste(screen.getByLabelText(/^Image drop zone/), { clipboardData: { files, getData: () => text } })
}

function stubImageClipboard() {
  const write = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      items: Record<string, Blob | Promise<Blob>>
      constructor(items: Record<string, Blob | Promise<Blob>>) {
        this.items = items
      }
    },
  )
  return write
}

describe('ImageBufferWidget', () => {
  it('starts on an empty drop zone with no preview', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps a dropped image and previews it', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)

    dropFiles([imageFile('screenshot.png')])

    expect(screen.getByRole('img', { name: 'screenshot.png preview' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'screenshot.png' })).toBeInTheDocument()
    expect(screen.queryByText(/drop images here/i)).not.toBeInTheDocument()
  })

  it('keeps several dropped images and previews the last one', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)

    dropFiles([imageFile('a.png'), imageFile('b.jpg', 'image/jpeg')])

    expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'b.jpg' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'b.jpg preview' })).toBeInTheDocument()
  })

  it('keeps an image pasted from the clipboard', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)

    pasteFiles([imageFile('clipboard.png')])

    expect(screen.getByRole('img', { name: 'clipboard.png preview' })).toBeInTheDocument()
  })

  it('leaves a text paste alone', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)

    pasteFiles([], 'some pasted text')

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument()
  })

  it('keeps an image chosen through the file picker', async () => {
    const user = userEvent.setup()
    render(<ImageBufferWidget instanceId="test" mode="grid" />)

    await user.upload(screen.getByLabelText('Choose image files'), imageFile('picked.png'))

    expect(screen.getByRole('img', { name: 'picked.png preview' })).toBeInTheDocument()
  })

  it('rejects a non-image file with a visible error and keeps nothing', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)

    dropFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })])

    expect(screen.getByText(/notes\.txt is not an image/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('switches the preview to the thumbnail that was clicked', async () => {
    const user = userEvent.setup()
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('a.png'), imageFile('b.png')])

    await user.click(screen.getByRole('button', { name: 'a.png' }))

    expect(screen.getByRole('img', { name: 'a.png preview' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'b.png preview' })).not.toBeInTheDocument()
  })

  it('removes the selected image and falls back to the newest remaining one', async () => {
    const user = userEvent.setup()
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('a.png'), imageFile('b.png')])

    await user.click(screen.getByRole('button', { name: 'Remove b.png' }))

    expect(screen.queryByRole('img', { name: 'b.png' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'a.png preview' })).toBeInTheDocument()
  })

  it('returns to the empty state once the last image is removed', async () => {
    const user = userEvent.setup()
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('a.png')])

    await user.click(screen.getByRole('button', { name: 'Remove a.png' }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument()
  })

  it('clears every image at once', async () => {
    const user = userEvent.setup()
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('a.png'), imageFile('b.png')])

    await user.click(screen.getByRole('button', { name: /clear all \(2\)/i }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('offers the selected image as a download under its own name', () => {
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('screenshot.png')])

    const link = screen.getByRole('link', { name: 'Download screenshot.png' })
    expect(link).toHaveAttribute('download', 'screenshot.png')
    expect(link).toHaveAttribute('href', expect.stringMatching(/^blob:/))
  })

  it('copies the selected image to the clipboard as PNG', async () => {
    const user = userEvent.setup()
    const write = stubImageClipboard()
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    const file = imageFile('screenshot.png')
    dropFiles([file])

    await user.click(screen.getByRole('button', { name: /^copy$/i }))

    expect(mockedToPngBlob).toHaveBeenCalledWith(file)
    expect(write).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('reports a failed copy', async () => {
    const user = userEvent.setup()
    const write = stubImageClipboard()
    write.mockRejectedValue(new Error('denied'))
    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('screenshot.png')])

    await user.click(screen.getByRole('button', { name: /^copy$/i }))

    expect(await screen.findByText('Copy failed')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('keeps its images across a remount of the same instance', () => {
    const { unmount } = render(<ImageBufferWidget instanceId="test" mode="grid" />)
    dropFiles([imageFile('screenshot.png')])
    unmount()

    render(<ImageBufferWidget instanceId="test" mode="grid" />)
    expect(screen.getByRole('img', { name: 'screenshot.png preview' })).toBeInTheDocument()
  })
})

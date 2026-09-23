import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { convertImage, toPngBlob } from './convertImage'
import ImageConverterWidget from './ImageConverterWidget'

// convertImage.ts wraps createImageBitmap/<canvas> browser plumbing jsdom
// can't run for real (no 2D canvas backend, no real image decoding) — mock
// the module boundary instead, the same way PageColorPicker.test.tsx mocks
// its own capture plumbing. A default rejection means a test that reaches
// the conversion effect without setting its own result fails loudly rather
// than hanging.
vi.mock('./convertImage', () => ({ convertImage: vi.fn(), toPngBlob: vi.fn() }))
const mockedConvertImage = vi.mocked(convertImage)
const mockedToPngBlob = vi.mocked(toPngBlob)

beforeEach(() => {
  mockedConvertImage.mockReset().mockRejectedValue(new Error('convertImage not stubbed for this test'))
  // Real re-encoding needs a canvas jsdom doesn't have; the default no-op
  // passthrough is right for every test whose blob is already `image/png`
  // (real toPngBlob would return it unchanged too) — a test for a lossy
  // target format overrides this to see the re-encoded blob get used.
  mockedToPngBlob.mockReset().mockImplementation(async (blob) => blob)
  // jsdom has no object-URL implementation at all.
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]

function imageFile(name: string, header: number[], type = ''): File {
  return new File([new Uint8Array(header)], name, { type })
}

/** jsdom builds no real DataTransfer, so the drop event carries the
 * minimum shape the widget reads off it. */
function dropFile(file: File) {
  fireEvent.drop(screen.getByText(/drop an image here/i), { dataTransfer: { files: [file] } })
}

/** Same idea for a paste: jsdom's ClipboardEvent carries no real
 * DataTransfer either, so the event is given the minimum `items` shape
 * `fileFromClipboard` reads off it. Fired on the empty-state drop zone by
 * default, or on the loaded-file bar (to exercise pasting a replacement)
 * when `target` is passed. */
function pasteFile(file: File, target: HTMLElement = screen.getByLabelText(/^Image drop zone/)) {
  fireEvent.paste(target, {
    clipboardData: { items: [{ kind: 'file', type: file.type, getAsFile: () => file }] },
  })
}

/** jsdom implements neither `canvas.toBlob` nor the Clipboard/ClipboardItem
 * write path, so stub both the way QrCodeWidget.test.tsx does for its own
 * copy-image button. */
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

/** The badge reporting what the *source* was detected as. Queried by its
 * label rather than by its text, because the target-format buttons carry
 * the same format names: a bare `findByText('PNG')` matches the PNG button
 * the moment a file is dropped, and so passes before detection has even
 * run. */
function detectedFormat() {
  return screen.findByLabelText(/^Detected source format/)
}

describe('ImageConverterWidget', () => {
  it('starts on an empty drop zone', () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('detects the source format of a dropped file from its bytes, not its name', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('mislabelled.jpg', PNG_HEADER))

    expect(await detectedFormat()).toHaveTextContent('PNG')
    expect(screen.getByText('mislabelled.jpg')).toBeInTheDocument()
  })

  it('includes the detected format in the badge’s accessible label, not just its visible text', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('mislabelled.jpg', PNG_HEADER))

    expect(await detectedFormat()).toHaveAccessibleName('Detected source format: PNG')
  })

  it('detects a format even when the browser reports no MIME type', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(
      imageFile(
        'shot',
        [...'GIF89a'].map((char) => char.charCodeAt(0)),
      ),
    )

    expect(await screen.findByText('GIF')).toBeInTheDocument()
  })

  it('reports a file it cannot recognize as an image', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(
      imageFile(
        'notes.txt',
        [...'hello there'].map((char) => char.charCodeAt(0)),
        'text/plain',
      ),
    )

    expect(await screen.findByText(/could not recognize notes\.txt/i)).toBeInTheDocument()
    expect(await detectedFormat()).toHaveTextContent('Unknown')
  })

  it('detects an SVG whose root tag sits past a long prologue', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    const prologue =
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      '<!-- Generated by a drawing program that likes long banners -->\n'
    const svg = `${prologue}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`
    expect(prologue.length).toBeGreaterThan(64)

    dropFile(
      imageFile(
        'logo.svg',
        [...svg].map((char) => char.charCodeAt(0)),
        'image/svg+xml',
      ),
    )

    expect(await detectedFormat()).toHaveTextContent('SVG')
  })

  it('does not take an HTML page with an inline icon for an image', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    const html = '<!doctype html>\n<html><body><svg viewBox="0 0 8 8"><rect /></svg></body></html>'
    dropFile(
      imageFile(
        'page.html',
        [...html].map((char) => char.charCodeAt(0)),
        'text/html',
      ),
    )

    expect(await screen.findByText(/could not recognize page\.html/i)).toBeInTheDocument()
  })

  it('offers the encodable target formats and a quality slider only for lossy ones', async () => {
    const user = userEvent.setup()
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()

    // PNG is the default target and is lossless.
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'JPEG' }))
    expect(screen.getByRole('slider')).toHaveValue('90')

    await user.click(screen.getByRole('button', { name: 'PNG' }))
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('goes back to the drop zone when the image is removed', async () => {
    const user = userEvent.setup()
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()

    await user.click(screen.getByRole('button', { name: /remove image/i }))

    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument()
  })

  it('keeps the chosen target format across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()
    await user.click(screen.getByRole('button', { name: 'WebP' }))
    unmount()

    render(<ImageConverterWidget instanceId="test" mode="grid" />)
    expect(await screen.findByRole('button', { name: 'WebP' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('accepts an image pasted into the widget, the same as a drop', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    pasteFile(imageFile('clipboard.png', PNG_HEADER, 'image/png'))

    expect(await detectedFormat()).toHaveTextContent('PNG')
    expect(screen.getByText('clipboard.png')).toBeInTheDocument()
  })

  it('ignores a clipboard paste that carries no file', () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    fireEvent.paste(screen.getByLabelText(/^Image drop zone/), {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
    })

    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
  })

  it('prefers the image item when a paste carries an image alongside other data', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    const htmlFile = new File(['<p>desc</p>'], 'clipboard.html', { type: 'text/html' })
    const pngFile = imageFile('clipboard.png', PNG_HEADER, 'image/png')
    fireEvent.paste(screen.getByLabelText(/^Image drop zone/), {
      clipboardData: {
        items: [
          { kind: 'file', type: htmlFile.type, getAsFile: () => htmlFile },
          { kind: 'file', type: pngFile.type, getAsFile: () => pngFile },
        ],
      },
    })

    expect(await detectedFormat()).toHaveTextContent('PNG')
    expect(screen.getByText('clipboard.png')).toBeInTheDocument()
  })

  it('detects a pasted image from its bytes even when the clipboard reports no image type', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    pasteFile(imageFile('clipboard', PNG_HEADER, ''))

    expect(await detectedFormat()).toHaveTextContent('PNG')
  })

  it('replaces the loaded image with one pasted into the focused file bar', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('original.gif', [...'GIF89a'].map((char) => char.charCodeAt(0))))
    await detectedFormat()

    pasteFile(imageFile('clipboard.png', PNG_HEADER, 'image/png'), screen.getByLabelText(/^original\.gif/))

    expect(await detectedFormat()).toHaveTextContent('PNG')
    expect(screen.getByText('clipboard.png')).toBeInTheDocument()
  })

  it('swaps the drop zone’s paste hint to "ready" once it is focused, and back on blur', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)
    const zone = screen.getByLabelText(/^Image drop zone/)

    expect(screen.getByText(/click, then paste/i)).toBeInTheDocument()

    fireEvent.focus(zone)
    expect(await screen.findByText(/ready to paste/i)).toBeInTheDocument()

    fireEvent.blur(zone)
    expect(await screen.findByText(/click, then paste/i)).toBeInTheDocument()
  })

  it('keeps the "ready" paste hint when focus moves from the zone to its own Browse button', () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)
    const zone = screen.getByLabelText(/^Image drop zone/)

    fireEvent.focus(zone)
    fireEvent.blur(zone, { relatedTarget: screen.getByRole('button', { name: /browse/i }) })

    expect(screen.getByText(/ready to paste/i)).toBeInTheDocument()
  })

  it('reveals a "ready to replace" hint when the loaded file bar is focused', async () => {
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()

    expect(screen.queryByText(/ready.*replace/i)).not.toBeInTheDocument()

    fireEvent.focus(screen.getByLabelText(/^photo\.png/))
    expect(await screen.findByText(/ready.*replace/i)).toBeInTheDocument()
  })

  it('copies the converted image to the clipboard', async () => {
    const user = userEvent.setup()
    // userEvent.setup() installs its own clipboard stub, so the real
    // clipboard override below has to come after it or userEvent clobbers
    // it right back.
    const write = stubImageClipboard()
    const blob = new Blob(['converted'], { type: 'image/png' })
    mockedConvertImage.mockResolvedValue({ blob, width: 10, height: 10 })
    render(<ImageConverterWidget instanceId="test-copy" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()

    await user.click(await screen.findByRole('button', { name: /^copy$/i }))

    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0]
    // The clipboard is handed toPngBlob's own pending promise rather than
    // an already-resolved blob (see the widget's comment on why).
    expect(await items[0].items['image/png']).toBe(blob)
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument()
  })

  it('re-encodes a non-PNG conversion as PNG before copying, since the clipboard API rejects other types', async () => {
    const user = userEvent.setup()
    const write = stubImageClipboard()
    const jpegBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    const pngBlob = new Blob(['png-bytes'], { type: 'image/png' })
    mockedConvertImage.mockResolvedValue({ blob: jpegBlob, width: 10, height: 10 })
    mockedToPngBlob.mockResolvedValue(pngBlob)
    render(<ImageConverterWidget instanceId="test-copy-jpeg" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()
    await user.click(screen.getByRole('button', { name: 'JPEG' }))

    await user.click(await screen.findByRole('button', { name: /^copy$/i }))

    expect(mockedToPngBlob).toHaveBeenCalledWith(jpegBlob)
    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0]
    expect(await items[0].items['image/png']).toBe(pngBlob)
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument()
  })

  it('shows a failure state when copying the converted image is rejected', async () => {
    const user = userEvent.setup()
    stubImageClipboard()
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    mockedConvertImage.mockResolvedValue({ blob: new Blob(['x'], { type: 'image/png' }), width: 1, height: 1 })
    render(<ImageConverterWidget instanceId="test-copy-fail" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await detectedFormat()

    await user.click(await screen.findByRole('button', { name: /^copy$/i }))

    expect(await screen.findByRole('button', { name: /copy failed/i })).toBeInTheDocument()
  })
})

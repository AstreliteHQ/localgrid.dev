import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageConverterWidget from './ImageConverterWidget'

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]

function imageFile(name: string, header: number[], type = ''): File {
  return new File([new Uint8Array(header)], name, { type })
}

/** jsdom builds no real DataTransfer, so the drop event carries the
 * minimum shape the widget reads off it. */
function dropFile(file: File) {
  fireEvent.drop(screen.getByText(/drop an image here/i), { dataTransfer: { files: [file] } })
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

    expect(await screen.findByText('PNG')).toBeInTheDocument()
    expect(screen.getByText('mislabelled.jpg')).toBeInTheDocument()
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
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('offers the encodable target formats and a quality slider only for lossy ones', async () => {
    const user = userEvent.setup()
    render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await screen.findByText('PNG')

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
    await screen.findByText('PNG')

    await user.click(screen.getByRole('button', { name: /remove image/i }))

    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument()
  })

  it('keeps the chosen target format across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ImageConverterWidget instanceId="test" mode="grid" />)

    dropFile(imageFile('photo.png', PNG_HEADER))
    await screen.findByText('PNG')
    await user.click(screen.getByRole('button', { name: 'WebP' }))
    unmount()

    render(<ImageConverterWidget instanceId="test" mode="grid" />)
    expect(await screen.findByRole('button', { name: 'WebP' })).toHaveAttribute('aria-pressed', 'true')
  })
})

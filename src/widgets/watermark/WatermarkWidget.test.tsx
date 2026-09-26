import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PDFDocument } from 'pdf-lib'
import { watermarkImage } from './watermarkImage'
import WatermarkWidget from './WatermarkWidget'

// watermarkImage.ts wraps createImageBitmap/<canvas> browser plumbing jsdom
// can't run for real (no 2D canvas backend, no real image decoding) — mock
// the module boundary instead, the same way ImageConverterWidget.test.tsx
// mocks convertImage.ts. watermarkPdf.ts is pure pdf-lib and runs for real.
vi.mock('./watermarkImage', () => ({ watermarkImage: vi.fn() }))
const mockedWatermarkImage = vi.mocked(watermarkImage)

beforeEach(() => {
  mockedWatermarkImage.mockReset().mockRejectedValue(new Error('watermarkImage not stubbed for this test'))
  // jsdom has no object-URL implementation at all.
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

async function makePdf(pageCount = 1): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200])
  const bytes = await doc.save()
  return new File([new Uint8Array(bytes)], 'doc.pdf', { type: 'application/pdf' })
}

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngFile(name = 'photo.png'): File {
  return new File([new Uint8Array(PNG_HEADER)], name, { type: 'image/png' })
}

/** jsdom builds no real DataTransfer, so the drop event carries the
 * minimum shape the widget reads off it. */
function dropFile(file: File) {
  fireEvent.drop(screen.getByLabelText('Image or PDF drop zone'), { dataTransfer: { files: [file] } })
}

function applyButton() {
  return screen.getByRole('button', { name: /add watermark/i })
}

describe('WatermarkWidget', () => {
  it('starts on an empty drop zone', () => {
    render(<WatermarkWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/drop an image or pdf here/i)).toBeInTheDocument()
  })

  it('detects a dropped PDF from its bytes', async () => {
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf())

    expect(await screen.findByText('PDF')).toBeInTheDocument()
  })

  it('detects a dropped image from its bytes', async () => {
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(pngFile())

    expect(await screen.findByText('Image')).toBeInTheDocument()
  })

  it('disables adding a watermark until text is typed in', async () => {
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf())
    await screen.findByText('PDF')

    expect(applyButton()).toBeDisabled()
  })

  it('watermarks a PDF and offers it for download', async () => {
    const user = userEvent.setup()
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf(2))
    await screen.findByText('PDF')
    await user.type(screen.getByLabelText('Watermark text'), 'CONFIDENTIAL')
    await user.click(applyButton())

    const download = await screen.findByRole('link', { name: /download doc-watermarked\.pdf/i })
    expect(download).toHaveAttribute('download', 'doc-watermarked.pdf')
  })

  it('watermarks an image, showing a preview and offering it for download', async () => {
    const user = userEvent.setup()
    mockedWatermarkImage.mockResolvedValue({ blob: new Blob(['png-bytes'], { type: 'image/png' }), width: 10, height: 10 })
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(pngFile('photo.png'))
    await screen.findByText('Image')
    await user.type(screen.getByLabelText('Watermark text'), 'CONFIDENTIAL')
    await user.click(applyButton())

    expect(await screen.findByAltText('Watermarked preview')).toBeInTheDocument()
    const download = await screen.findByRole('link', { name: /download photo-watermarked\.png/i })
    expect(download).toHaveAttribute('download', 'photo-watermarked.png')
  })

  it('shows an error and no download when watermarking fails', async () => {
    const user = userEvent.setup()
    mockedWatermarkImage.mockRejectedValue(new Error('This browser cannot encode PNG.'))
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(pngFile())
    await screen.findByText('Image')
    await user.type(screen.getByLabelText('Watermark text'), 'CONFIDENTIAL')
    await user.click(applyButton())

    expect(await screen.findByText('This browser cannot encode PNG.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument()
  })

  it('clears a prior result once the text changes again', async () => {
    const user = userEvent.setup()
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf())
    await screen.findByText('PDF')
    await user.type(screen.getByLabelText('Watermark text'), 'DRAFT')
    await user.click(applyButton())
    await screen.findByRole('link', { name: /download/i })

    await user.type(screen.getByLabelText('Watermark text'), '!')

    expect(screen.queryByRole('link', { name: /download/i })).not.toBeInTheDocument()
  })

  it('removing the file resets back to the empty drop zone', async () => {
    const user = userEvent.setup()
    render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf())
    await screen.findByText('PDF')

    await user.click(screen.getByRole('button', { name: /remove file/i }))

    expect(screen.getByText(/drop an image or pdf here/i)).toBeInTheDocument()
  })

  it('keeps its file and settings across a remount of the same instance', async () => {
    const { unmount } = render(<WatermarkWidget instanceId="test" mode="grid" />)

    dropFile(await makePdf())
    await screen.findByText('PDF')
    unmount()

    render(<WatermarkWidget instanceId="test" mode="grid" />)
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    await screen.findByText('PDF')
  })
})

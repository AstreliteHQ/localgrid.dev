import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageMetadataWidget from './ImageMetadataWidget'
import { readImageMetadata } from './metadata'
import { buildJpeg, buildPng, SAMPLE_XMP, sampleExif, samplePhotoshop } from './testImages'

let instance = 0
function renderWidget() {
  instance += 1
  return render(<ImageMetadataWidget instanceId={`metadata-${instance}`} mode="grid" />)
}

function jpegFile(bytes = buildJpeg({ exif: sampleExif(), xmp: SAMPLE_XMP, photoshop: samplePhotoshop() })) {
  return new File([bytes as Uint8Array<ArrayBuffer>], 'photo.jpg', { type: 'image/jpeg' })
}

function dropFile(file: File) {
  fireEvent.drop(screen.getByText(/drop an image here/i), { dataTransfer: { files: [file] } })
}

/** Reads back what the Download button produced. */
async function downloaded(): Promise<ReturnType<typeof readImageMetadata>> {
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob
  return readImageMetadata(new Uint8Array(await blob.arrayBuffer()))
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

describe('ImageMetadataWidget', () => {
  it('starts on an empty drop zone', () => {
    renderWidget()
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
  })

  it('lists the EXIF, IPTC and XMP fields of a dropped image', async () => {
    renderWidget()
    dropFile(jpegFile())

    expect(await screen.findByRole('textbox', { name: 'Model' })).toHaveValue('Canon EOS R6')
    expect(screen.getByText('Rotate 90 CW')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Caption-Abstract' })).toHaveValue('Sunset over the Seine')
    expect(screen.getByRole('textbox', { name: 'dc:subject' })).toHaveValue('paris; travel')
    expect(screen.getByRole('region', { name: 'EXIF fields' })).toBeInTheDocument()
    expect(screen.getByText('JPEG')).toBeInTheDocument()
    expect(screen.getByText('Location: 48.85823, 2.29450')).toBeInTheDocument()
  })

  it('downloads the image with edits and removals applied', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(jpegFile())

    const artist = await screen.findByRole('textbox', { name: 'Artist' })
    await user.clear(artist)
    await user.type(artist, 'Anonymous')
    await user.click(screen.getByRole('button', { name: 'Remove Make' }))
    expect(screen.getByText(/1 edited, 1 removed/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /download/i }))
    const result = await downloaded()
    expect(result.fields.find((field) => field.name === 'Artist')?.value).toBe('Anonymous')
    expect(result.fields.some((field) => field.name === 'Make')).toBe(false)
  })

  it('strips GPS in one click and can undo it', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(jpegFile())

    await user.click(await screen.findByRole('button', { name: 'Strip GPS' }))
    expect(screen.getByText('Location data will be removed')).toBeInTheDocument()
    expect(screen.getByText(/5 removed/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /download/i }))
    expect((await downloaded()).gps).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('strips a whole section', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(jpegFile())

    const xmp = await screen.findByRole('region', { name: 'XMP fields' })
    await user.click(within(xmp).getByRole('button', { name: 'Strip XMP' }))
    await user.click(screen.getByRole('button', { name: /download/i }))
    const result = await downloaded()
    expect(result.fields.some((field) => field.section === 'xmp')).toBe(false)
    expect(result.fields.some((field) => field.section === 'exif')).toBe(true)
  })

  it('blocks the download while a value does not fit its field', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(jpegFile())

    const iso = await screen.findByRole('textbox', { name: 'ISO' })
    await user.clear(iso)
    await user.type(iso, 'lots')
    expect(screen.getByText('"lots" is not a number.')).toBeInTheDocument()
    expect(iso).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Restore ISO' }))
    expect(screen.getByRole('textbox', { name: 'ISO' })).toHaveValue('400')
    expect(screen.getByRole('button', { name: /download/i })).toBeEnabled()
  })

  it('filters fields by name or value', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(jpegFile())

    await user.type(await screen.findByRole('textbox', { name: 'Filter fields' }), 'canon')
    expect(screen.getByRole('textbox', { name: 'Make' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Artist' })).not.toBeInTheDocument()
  })

  it('says so when an image has no metadata', async () => {
    renderWidget()
    dropFile(new File([buildPng() as Uint8Array<ArrayBuffer>], 'empty.png', { type: 'image/png' }))
    expect(await screen.findByText(/no exif, iptc or xmp metadata/i)).toBeInTheDocument()
  })

  it('rejects unsupported formats', async () => {
    renderWidget()
    dropFile(new File([Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)], 'anim.gif', { type: 'image/gif' }))
    expect(await screen.findByText(/only jpeg, png and webp/i)).toBeInTheDocument()
  })

  it('clears back to the drop zone', async () => {
    const user = userEvent.setup()
    renderWidget()
    dropFile(jpegFile())
    await screen.findByRole('textbox', { name: 'Model' })
    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
  })
})

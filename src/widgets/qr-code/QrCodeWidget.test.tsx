import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QrCodeWidget from './QrCodeWidget'

/** jsdom implements neither `canvas.toBlob` nor the Clipboard/ClipboardItem
 * write path, so stub both the way WcagCheckerWidget.test.tsx stubs
 * `navigator.clipboard.writeText` for its own copy button. */
function stubImageClipboard() {
  const blob = new Blob(['fake-png'], { type: 'image/png' })
  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
    callback(blob)
  }
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

describe('QrCodeWidget', () => {
  it('renders a QR code for the default text value', () => {
    render(<QrCodeWidget instanceId="test" mode="grid" />)
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })

  it('shows a hint instead of a QR code once the text is cleared', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-empty" mode="grid" />)

    await user.clear(screen.getByLabelText(/text or url/i))

    expect(document.querySelector('canvas')).not.toBeInTheDocument()
    expect(screen.getByText(/enter some text or a url/i)).toBeInTheDocument()
  })

  it('switches to the Wi-Fi form and renders a QR code once an SSID is entered', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-wifi" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Wi-Fi' }))
    expect(document.querySelector('canvas')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('MyNetwork'), 'HomeNetwork')
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })

  it('hides the password field once the network is set to open (no password)', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-wifi-open" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Wi-Fi' }))
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'None' }))
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument()
  })

  it('reveals customization controls once the Customize panel is opened', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-customize" mode="grid" />)

    expect(screen.queryByLabelText(/size \(px\)/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /customize/i }))

    expect(screen.getByLabelText(/size \(px\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/foreground color/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/background color/i)).toBeInTheDocument()
  })

  it('spells out the error correction levels and explains the selected one', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-error-level" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /customize/i }))

    // Bare "L"/"M"/"Q"/"H" letters weren't self-explanatory, so spelled out now.
    expect(screen.getByRole('button', { name: 'Low' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quartile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'High' })).toBeInTheDocument()

    expect(screen.getByText(/recovers from ~15% damage/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'High' }))
    expect(screen.getByText(/recovers from ~30% damage/i)).toBeInTheDocument()
  })

  it('shows a contact-card QR code once a first name is entered', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-vcard" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Contact' }))
    expect(document.querySelector('canvas')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/first name/i), 'Ada')
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })

  it('caps the rendered canvas at the max size even while typing an oversized value', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-size-cap" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /customize/i }))
    const sizeField = screen.getByLabelText(/size \(px\)/i)
    await user.clear(sizeField)
    // Typed digit-by-digit without blurring: NumberField reports each
    // intermediate value (99, 999, 9999…) as-is, which is exactly the
    // unclamped, mid-edit state the render path has to defend against.
    await user.type(sizeField, '999999')

    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas!.width).toBe(1024)
  })

  it('caps the canvas at the min size for an oversized negative value', async () => {
    const user = userEvent.setup()
    render(<QrCodeWidget instanceId="test-size-floor" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /customize/i }))
    const sizeField = screen.getByLabelText(/size \(px\)/i)
    await user.clear(sizeField)
    await user.type(sizeField, '-5')

    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas!.width).toBe(96)
  })

  it('scales the canvas to its (fixed-width) preview box rather than a percentage of an auto-sized parent', () => {
    render(<QrCodeWidget instanceId="test-preview-box" mode="grid" />)

    const canvas = document.querySelector('canvas')!
    // The box has an explicit width (capped, not shrink-to-fit around the
    // canvas), and the canvas fills it at 100%. A % width on the canvas
    // resolving against an auto-width ancestor was what made the on-screen
    // size (and centering) inconsistent across renders.
    expect(canvas.parentElement).toHaveClass('w-full', 'max-w-[240px]')
    expect(canvas.style.width).toBe('100%')
    expect(canvas.style.height).toBe('auto')
  })

  it('copies the QR code as a PNG image to the clipboard', async () => {
    // userEvent.setup() installs its own clipboard stub, so the real
    // clipboard override below has to come after it or userEvent clobbers
    // it right back.
    const user = userEvent.setup()
    const write = stubImageClipboard()
    render(<QrCodeWidget instanceId="test-copy-image" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /copy image/i }))

    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0]
    expect(items).toHaveLength(1)
    expect(await items[0].items['image/png']).toBeInstanceOf(Blob)
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument()
  })

  it('shows a failure state when the clipboard write is rejected', async () => {
    const user = userEvent.setup()
    stubImageClipboard()
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    render(<QrCodeWidget instanceId="test-copy-image-fail" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /copy image/i }))

    expect(await screen.findByRole('button', { name: /copy failed/i })).toBeInTheDocument()
  })
})

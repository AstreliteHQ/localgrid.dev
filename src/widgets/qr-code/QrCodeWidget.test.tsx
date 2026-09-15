import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QrCodeWidget from './QrCodeWidget'

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
    // Typed digit-by-digit without blurring — NumberField reports each
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
    // canvas), and the canvas fills it at 100% — a % width on the canvas
    // resolving against an auto-width ancestor was what made the on-screen
    // size (and centering) inconsistent across renders.
    expect(canvas.parentElement).toHaveClass('w-full', 'max-w-[240px]')
    expect(canvas.style.width).toBe('100%')
    expect(canvas.style.height).toBe('auto')
  })
})

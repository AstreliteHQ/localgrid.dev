import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClipboardInspectorWidget from './ClipboardInspectorWidget'

function clipboardData(formats: Record<string, string>, files: File[] = []) {
  return {
    types: [...Object.keys(formats), ...(files.length > 0 ? ['Files'] : [])],
    getData: (type: string) => formats[type] ?? '',
    files,
  }
}

function paste(formats: Record<string, string>, files: File[] = []) {
  fireEvent.paste(screen.getByRole('group', { name: /paste area/i }), {
    clipboardData: clipboardData(formats, files),
  })
}

describe('ClipboardInspectorWidget', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with a paste prompt and no formats', () => {
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/paste anything to inspect it/i)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /clipboard formats/i })).not.toBeInTheDocument()
  })

  it('lists every pasted format with its family and size', () => {
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({ 'text/plain': 'Hello', 'text/html': '<b>Hello</b>' })

    const list = screen.getByRole('list', { name: /clipboard formats/i })
    const rows = within(list).getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Plain text')
    expect(rows[0]).toHaveTextContent('text/plain')
    expect(rows[0]).toHaveTextContent('5 B')
    expect(rows[1]).toHaveTextContent('HTML / markup')
    expect(rows[1]).toHaveTextContent('12 B')
    expect(screen.getByText('2 formats')).toBeInTheDocument()
  })

  it('renders HTML in a sandboxed frame and shows its source in the raw view', async () => {
    const user = userEvent.setup()
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({ 'text/plain': 'Hello', 'text/html': '<b>Hello</b>' })

    await user.click(screen.getByRole('button', { name: /text\/html/i }))
    const frame = screen.getByTitle('HTML preview')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc')).toContain('<b>Hello</b>')

    await user.click(screen.getByRole('button', { name: 'Raw' }))
    expect(within(screen.getByRole('region', { name: 'Raw' })).getByText('<b>Hello</b>')).toBeInTheDocument()
  })

  it('shows the text inside an RTF payload', async () => {
    const user = userEvent.setup()
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({ 'text/rtf': '{\\rtf1{\\fonttbl{\\f0 Arial;}}\\f0 Rich {\\b words}}' })

    await user.click(screen.getByRole('button', { name: /text\/rtf/i }))
    expect(screen.getByText('Rich words')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy as text/i })).toBeInTheDocument()
  })

  it('previews a pasted image file', () => {
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({}, [new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })])

    expect(screen.getByText('shot.png')).toBeInTheDocument()
    expect(screen.getByAltText('Pasted image/png image')).toHaveAttribute('src', 'blob:mock-url')
  })

  it('copies a single text format back as plain text when ClipboardItem is unavailable', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({ 'text/plain': 'Hello', 'text/html': '<b>Hello</b>' })

    await user.click(screen.getByRole('button', { name: /text\/html/i }))
    await user.click(screen.getByRole('button', { name: /copy as text/i }))

    expect(writeText).toHaveBeenCalledWith('<b>Hello</b>')
    expect(screen.getByText('Copied')).toBeInTheDocument()
  })

  it('says so when a paste carries nothing readable, keeping what was there', () => {
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({ 'text/plain': 'Hello' })
    paste({ 'application/x-private': '' })

    expect(screen.getByText(/nothing this browser can read/i)).toBeInTheDocument()
    expect(screen.getByText('1 format')).toBeInTheDocument()
  })

  it('clears back to the paste prompt', async () => {
    const user = userEvent.setup()
    render(<ClipboardInspectorWidget instanceId="test" mode="grid" />)
    paste({ 'text/plain': 'Hello' })

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText(/paste anything to inspect it/i)).toBeInTheDocument()
  })
})

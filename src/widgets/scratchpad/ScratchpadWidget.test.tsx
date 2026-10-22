import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSONContent } from '@tiptap/react'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import ScratchpadWidget from './ScratchpadWidget'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw=='

function seed(doc: JSONContent) {
  useWidgetStateStore.getState().setValue('test:doc', doc)
}

function storedDoc() {
  return useWidgetStateStore.getState().values['test:doc'] as JSONContent | null | undefined
}

function editorElement() {
  return screen.getByRole('textbox', { name: 'Scratchpad' })
}

/** jsdom has neither `ClipboardItem` nor `navigator.clipboard.write`; stub
 * both and capture what each write was given. */
function stubClipboard() {
  const written: Record<string, Blob>[] = []
  class FakeClipboardItem {
    items: Record<string, Blob>
    constructor(items: Record<string, Blob>) {
      this.items = items
    }
  }
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
  const write = vi.fn(async (items: FakeClipboardItem[]) => {
    written.push(...items.map((item) => item.items))
  })
  const writeText = vi.fn(async (_text: string) => {})
  Object.defineProperty(navigator, 'clipboard', { value: { write, writeText }, configurable: true })
  return { written, write, writeText }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ScratchpadWidget', () => {
  it('starts empty with copy and download disabled', () => {
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    expect(editorElement()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Download as scratchpad.html' })).toBeDisabled()
  })

  it('restores a stored note, images included', async () => {
    seed({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Login fails' }] },
        { type: 'image', attrs: { src: PNG_DATA_URL, alt: 'shot.png' } },
      ],
    })
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    expect(screen.getByText('Login fails')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'shot.png' })).toHaveAttribute('src', PNG_DATA_URL)
  })

  it('copies the note as HTML with embedded images plus a plain text fallback', async () => {
    seed({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Bug' }] },
        { type: 'image', attrs: { src: PNG_DATA_URL, alt: 'shot.png' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Steps' }] },
      ],
    })
    // After setup(): user-event installs its own clipboard stub there.
    const user = userEvent.setup()
    const clipboard = stubClipboard()
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /^copy$/i }))

    expect(clipboard.write).toHaveBeenCalledTimes(1)
    const [item] = clipboard.written
    const html = await item['text/html'].text()
    expect(html).toContain('<h2>Bug</h2>')
    expect(html).toContain(`src="${PNG_DATA_URL}"`)
    expect(await item['text/plain'].text()).toBe('Bug\n\n[image]\n\nSteps')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('downloads a standalone HTML document', async () => {
    let blob: Blob | null = null
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:mock-url'
    })
    URL.revokeObjectURL = vi.fn()
    let download = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      download = this.download
    })
    seed({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Timeout at 30s' }] }] })
    const user = userEvent.setup()
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Download as scratchpad.html' }))

    expect(download).toBe('scratchpad.html')
    const html = await blob!.text()
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<title>Timeout at 30s</title>')
    expect(html).toContain('<p>Timeout at 30s</p>')
  })

  it('inserts a pasted screenshot as an embedded image', async () => {
    render(<ScratchpadWidget instanceId="test" mode="grid" />)
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

    await act(async () => {
      fireEvent.paste(editorElement(), { clipboardData: { files: [file], getData: () => '', types: ['Files'] } })
    })

    await waitFor(() => expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute('src', PNG_DATA_URL))
    // The caret lands in a paragraph after the image, so the next key
    // types text instead of replacing the node-selected image.
    expect(storedDoc()?.content?.map((node) => node.type)).toEqual(['image', 'paragraph'])
  })

  it('treats a note holding only an image as content worth copying', async () => {
    seed({ type: 'doc', content: [{ type: 'image', attrs: { src: PNG_DATA_URL, alt: 'shot.png' } }] })
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    expect(await screen.findByRole('img', { name: 'shot.png' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeEnabled()
  })

  it('removes an image from its hover toolbar', async () => {
    seed({ type: 'doc', content: [{ type: 'image', attrs: { src: PNG_DATA_URL, alt: 'shot.png' } }] })
    const user = userEvent.setup()
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    await user.click(await screen.findByRole('button', { name: 'Remove image' }))

    expect(screen.queryByRole('img', { name: 'shot.png' })).not.toBeInTheDocument()
  })

  it('copies a single image as PNG', async () => {
    seed({ type: 'doc', content: [{ type: 'image', attrs: { src: PNG_DATA_URL, alt: 'shot.png' } }] })
    const user = userEvent.setup()
    const clipboard = stubClipboard()
    render(<ScratchpadWidget instanceId="test" mode="grid" />)

    await user.click(await screen.findByRole('button', { name: 'Copy image' }))

    await waitFor(() => expect(clipboard.write).toHaveBeenCalledTimes(1))
    const png = await (clipboard.written[0]['image/png'] as unknown as Promise<Blob>)
    expect(png.type).toBe('image/png')
    expect(await screen.findByRole('button', { name: 'Image copied' })).toBeInTheDocument()
  })

  it('toggles bold from the toolbar', async () => {
    seed({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] })
    const user = userEvent.setup()
    render(<ScratchpadWidget instanceId="test" mode="grid" />)
    const bold = screen.getByRole('button', { name: 'Bold' })
    expect(bold).toHaveAttribute('aria-pressed', 'false')

    await user.click(bold)

    expect(bold).toHaveAttribute('aria-pressed', 'true')
  })
})

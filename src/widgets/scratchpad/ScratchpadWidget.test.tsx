import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Editor, JSONContent } from '@tiptap/react'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { sanitizeWidgetData } from '@/widgets/widgetData'
import { useWidgetDataSettings } from '@/widgets/useWidgetDataSettings'
import { hasAnyDirtyWidget } from '@/widgets/useWidgetDirty'
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

  it('keeps a pasted image ahead of text typed while it is being read', async () => {
    seed({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] }] })
    let finishRead = () => {}
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      finishRead = () => {
        Object.defineProperty(this, 'result', { value: PNG_DATA_URL })
        this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>)
      }
    })
    render(<ScratchpadWidget instanceId="test" mode="grid" />)
    // TipTap exposes its instance on the editor's root element.
    const editor = (editorElement() as HTMLElement & { editor: Editor }).editor
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    })
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

    fireEvent.paste(editorElement(), { clipboardData: { files: [file], getData: () => '', types: ['Files'] } })
    act(() => {
      editor.commands.insertContent(' after')
    })
    await act(async () => finishRead())

    await waitFor(() =>
      expect(storedDoc()?.content?.map((node) => node.type)).toEqual(['paragraph', 'image', 'paragraph']),
    )
    expect(editor.getText({ blockSeparator: '|', textSerializers: { image: () => 'IMG' } })).toBe('Before|IMG| after')
  })

  it('says so when a pasted image cannot be read', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })
    render(<ScratchpadWidget instanceId="test" mode="grid" />)
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })

    await act(async () => {
      fireEvent.paste(editorElement(), { clipboardData: { files: [file], getData: () => '', types: ['Files'] } })
    })

    expect(await screen.findByText('Could not read that image.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
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

describe('ScratchpadWidget remember content', () => {
  function pin() {
    useDashboardStore.setState({
      dashboards: [
        { id: 'd', name: 'D', widgets: [{ instanceId: 'pinned', widgetId: 'scratchpad', x: 0, y: 0, w: 4, h: 5 }] },
      ],
      activeDashboardId: 'd',
    })
  }
  const savedData = () => useDashboardStore.getState().dashboards[0].widgets[0].data
  const savedText = () => JSON.stringify(savedData()?.savedDoc ?? null)

  function rememberBox() {
    return screen.getByRole('checkbox', { name: /remember content/i })
  }

  /** jsdom can't place a caret from a click, so type through the editor. */
  function typeIntoNote(text: string) {
    const editor = (editorElement() as HTMLElement & { editor: Editor }).editor
    act(() => {
      editor.chain().focus('end').insertContent(text).run()
    })
  }

  it('is off by default', () => {
    pin()
    render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    expect(rememberBox()).not.toBeChecked()
    expect(savedData()).toBeUndefined()
  })

  it('cannot be turned on while widget data is off', () => {
    pin()
    useWidgetDataSettings.getState().setEnabled(false)
    render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    expect(rememberBox()).toBeDisabled()
  })

  it('moves the note into widget data, keeping it through Clear state and a remount', async () => {
    const user = userEvent.setup()
    pin()
    const { unmount } = render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    typeIntoNote('Login fails')
    expect(hasAnyDirtyWidget()).toBe(true)
    await user.click(rememberBox())
    typeIntoNote(' on Safari')

    expect(savedData()?.remember).toBe(true)
    expect(savedText()).toContain('Login fails on Safari')
    // A remembered note is saved, so it is not unsaved content.
    expect(hasAnyDirtyWidget()).toBe(false)

    unmount()
    useWidgetStateStore.getState().resetInstances(['pinned'])
    render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    expect(screen.getByText('Login fails on Safari')).toBeInTheDocument()
    expect(rememberBox()).toBeChecked()
  })

  it('drops the widget data when turned off but keeps the note on screen', async () => {
    const user = userEvent.setup()
    pin()
    render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    await user.click(rememberBox())
    typeIntoNote('Login fails')
    await user.click(rememberBox())

    expect(savedData()).toBeUndefined()
    expect(screen.getByText('Login fails')).toBeInTheDocument()
    expect(rememberBox()).not.toBeChecked()
    expect(hasAnyDirtyWidget()).toBe(true)
  })

  it('clears the editor when the widget data is reset from outside', async () => {
    const user = userEvent.setup()
    pin()
    render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    await user.click(rememberBox())
    typeIntoNote('Login fails')
    act(() => useDashboardStore.getState().resetWidgetData('pinned'))

    expect(rememberBox()).not.toBeChecked()
    expect(screen.queryByText('Login fails')).not.toBeInTheDocument()
  })

  it('stays off and says so when the browser refuses to store the note', async () => {
    const user = userEvent.setup()
    pin()
    seed({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Huge' }] }] })
    render(<ScratchpadWidget instanceId="test" mode="grid" />)
    useDashboardStore.setState({
      dashboards: [
        { id: 'd', name: 'D', widgets: [{ instanceId: 'test', widgetId: 'scratchpad', x: 0, y: 0, w: 4, h: 5 }] },
      ],
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    await user.click(rememberBox())

    expect(rememberBox()).not.toBeChecked()
    expect(screen.getByText(/too large to remember/i)).toBeInTheDocument()
    expect(screen.getByText('Huge')).toBeInTheDocument()
    expect(storedDoc()).not.toBeNull()
  })

  it('remembers on an unpinned overlay instance until it is closed', async () => {
    const user = userEvent.setup()
    render(<ScratchpadWidget instanceId="test" mode="overlay" />)

    typeIntoNote('Login fails')
    await user.click(rememberBox())

    expect(rememberBox()).toBeChecked()
    expect(screen.getByText('Login fails')).toBeInTheDocument()
  })

  it('keeps only a well-formed saved note from a share link', () => {
    const savedDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }
    expect(sanitizeWidgetData('scratchpad', { remember: true, savedDoc })).toEqual({ remember: true, savedDoc })
    expect(sanitizeWidgetData('scratchpad', { remember: true, savedDoc: null })).toEqual({
      remember: true,
      savedDoc: null,
    })
    expect(sanitizeWidgetData('scratchpad', { remember: 'yes', savedDoc: { type: 'image' } })).toBeUndefined()
  })

  it('starts empty rather than failing on a saved note it cannot load', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useDashboardStore.setState({
      dashboards: [
        {
          id: 'd',
          name: 'D',
          widgets: [
            {
              instanceId: 'pinned',
              widgetId: 'scratchpad',
              x: 0,
              y: 0,
              w: 4,
              h: 5,
              data: { remember: true, savedDoc: { type: 'doc', content: [{ type: 'nonsense' }] } },
            },
          ],
        },
      ],
      activeDashboardId: 'd',
    })
    render(<ScratchpadWidget instanceId="pinned" mode="grid" />)

    expect(editorElement()).toBeInTheDocument()
    expect(rememberBox()).toBeChecked()
  })
})

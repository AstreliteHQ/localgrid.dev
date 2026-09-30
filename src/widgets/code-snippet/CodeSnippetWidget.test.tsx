import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView } from '@codemirror/view'
import { setCodeMirrorValue } from '@/test/codemirror'
import { renderSnippetImage } from './renderSnippetImage'
import CodeSnippetWidget from './CodeSnippetWidget'

// renderSnippetImage.ts wraps canvas plumbing jsdom can't run for real (no
// 2D canvas backend) — mock the module boundary instead, the same way
// ImageConverterWidget.test.tsx mocks convertImage.ts. tokenizeCode.ts and
// languages.ts underneath it are pure/DOM-free and run for real.
vi.mock('./renderSnippetImage', () => ({ renderSnippetImage: vi.fn() }))
const mockedRenderSnippetImage = vi.mocked(renderSnippetImage)

/** jsdom implements neither `canvas.toBlob` nor the Clipboard/ClipboardItem
 * write path, so stub both the way ImageConverterWidget.test.tsx does for
 * its own copy-image button. */
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

beforeEach(() => {
  mockedRenderSnippetImage
    .mockReset()
    .mockResolvedValue({ blob: new Blob(['png-bytes'], { type: 'image/png' }), width: 240, height: 96 })
  // jsdom has no object-URL implementation at all.
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

function codeField() {
  return screen.getByLabelText('Code')
}

describe('CodeSnippetWidget', () => {
  it('renders a preview of the sample code it opens with', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)

    expect(await screen.findByAltText('Syntax-highlighted code preview')).toBeInTheDocument()
    expect(mockedRenderSnippetImage).toHaveBeenCalled()
  })

  it('shows a placeholder instead of a preview once the code is cleared', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    setCodeMirrorValue(codeField(), '')

    await waitFor(() => expect(screen.queryByAltText('Syntax-highlighted code preview')).not.toBeInTheDocument())
    expect(screen.getByText(/paste some code/i)).toBeInTheDocument()
  })

  it('re-renders the preview when the code changes', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    setCodeMirrorValue(codeField(), 'const x = 1\nconsole.log("more")')

    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
  })

  it('re-tokenizes with the new language once one is picked', async () => {
    const user = userEvent.setup()
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    await user.click(screen.getByLabelText('Language'))
    await user.click(await screen.findByRole('option', { name: 'Python' }))

    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    const [, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.theme.id).toBe('dark')
  })

  it('offers the result for download once rendered', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    const download = screen.getByRole('link', { name: /download/i })
    expect(download).toHaveAttribute('href', 'blob:mock-url')
    expect(download).toHaveAttribute('download', 'snippet.png')
  })

  it('shows the preview at its own display size rather than the doubled export resolution', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)

    const preview = await screen.findByAltText('Syntax-highlighted code preview')
    expect(preview).toHaveAttribute('width', '240')
    expect(preview).toHaveAttribute('height', '96')
  })

  function lineNumberGutterElement(container: HTMLElement, lineNumber: number) {
    const candidates = Array.from(container.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
    const match = candidates.find((element) => element.textContent === String(lineNumber))
    if (!match) throw new Error(`no gutter element found for line ${lineNumber}`)
    return match
  }

  it('cycles a clicked line number through unmarked, highlighted, and blurred', async () => {
    const { container } = render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    fireEvent.click(lineNumberGutterElement(container, 1))
    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    let [, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.highlightedLines).toEqual(new Set([1]))
    expect(options.blurredLines).toEqual(new Set())

    mockedRenderSnippetImage.mockClear()
    fireEvent.click(lineNumberGutterElement(container, 1))
    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    ;[, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.highlightedLines).toEqual(new Set())
    expect(options.blurredLines).toEqual(new Set([1]))

    mockedRenderSnippetImage.mockClear()
    fireEvent.click(lineNumberGutterElement(container, 1))
    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    ;[, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.highlightedLines).toEqual(new Set())
    expect(options.blurredLines).toEqual(new Set())
  })

  it('highlights every selected line with the Mod-Shift-h shortcut', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    const view = EditorView.findFromDOM(codeField())!
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.line(2).to } })
    })
    fireEvent.keyDown(codeField(), { key: 'h', code: 'KeyH', ctrlKey: true, shiftKey: true })

    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    const [, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.highlightedLines).toEqual(new Set([1, 2]))
    expect(options.blurredLines).toEqual(new Set())
  })

  it('blurs every selected line with the Mod-Shift-b shortcut', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    const view = EditorView.findFromDOM(codeField())!
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.line(2).to } })
    })
    fireEvent.keyDown(codeField(), { key: 'b', code: 'KeyB', ctrlKey: true, shiftKey: true })

    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    const [, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.blurredLines).toEqual(new Set([1, 2]))
    expect(options.highlightedLines).toEqual(new Set())
  })

  it('offers more than just a dark/light choice of snippet theme', () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)

    const select = screen.getByLabelText('Theme') as HTMLSelectElement
    const labels = Array.from(select.options).map((option) => option.textContent)
    expect(labels).toEqual(['Dark', 'Dracula', 'Nord', 'Monokai', 'Light', 'Solarized Light'])
  })

  it('re-renders with the newly picked theme', async () => {
    const user = userEvent.setup()
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    await user.selectOptions(screen.getByLabelText('Theme'), 'Nord')

    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
    const [, options] = mockedRenderSnippetImage.mock.calls.at(-1)!
    expect(options.theme.id).toBe('nord')
  })

  it('offers a "Copy code" button that copies the raw code text, not the image', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    await user.click(screen.getByRole('button', { name: /copy code/i }))

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('function greet'))
  })

  it('copies the rendered image to the clipboard', async () => {
    const user = userEvent.setup()
    const write = stubImageClipboard()
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    mockedRenderSnippetImage.mockResolvedValue({ blob, width: 240, height: 96 })
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    await user.click(screen.getByRole('button', { name: /copy image/i }))

    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0]
    expect(await items[0].items['image/png']).toBe(blob)
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument()
  })

  it('shows an error instead of a stale preview when rendering fails', async () => {
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    mockedRenderSnippetImage.mockRejectedValue(new Error('This browser cannot encode PNG.'))
    setCodeMirrorValue(codeField(), 'const x = 1')

    expect(await screen.findByText('This browser cannot encode PNG.')).toBeInTheDocument()
  })

  it('keeps its code and settings across a remount of the same instance', async () => {
    const { unmount } = render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    setCodeMirrorValue(codeField(), '// custom marker')
    unmount()

    mockedRenderSnippetImage.mockClear()
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    expect(codeField()).toHaveTextContent('// custom marker')
    // Lets this remount's own (freshly re-run) language-loading effect
    // settle before the test ends, so its state update doesn't land after
    // cleanup and warn about a missing act().
    await waitFor(() => expect(mockedRenderSnippetImage).toHaveBeenCalled())
  })
})

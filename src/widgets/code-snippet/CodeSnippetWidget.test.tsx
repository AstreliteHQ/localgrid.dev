import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  mockedRenderSnippetImage.mockReset().mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' }))
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
    const user = userEvent.setup()
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    await user.clear(codeField())

    await waitFor(() => expect(screen.queryByAltText('Syntax-highlighted code preview')).not.toBeInTheDocument())
    expect(screen.getByText(/paste some code/i)).toBeInTheDocument()
  })

  it('re-renders the preview when the code changes', async () => {
    const user = userEvent.setup()
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')
    mockedRenderSnippetImage.mockClear()

    await user.type(codeField(), '\nconsole.log("more")')

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

  it('copies the rendered image to the clipboard', async () => {
    const user = userEvent.setup()
    const write = stubImageClipboard()
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    mockedRenderSnippetImage.mockResolvedValue(blob)
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    await user.click(screen.getByRole('button', { name: /copy image/i }))

    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0]
    expect(await items[0].items['image/png']).toBe(blob)
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument()
  })

  it('shows an error instead of a stale preview when rendering fails', async () => {
    const user = userEvent.setup()
    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    mockedRenderSnippetImage.mockRejectedValue(new Error('This browser cannot encode PNG.'))
    await user.type(codeField(), '!')

    expect(await screen.findByText('This browser cannot encode PNG.')).toBeInTheDocument()
  })

  it('keeps its code and settings across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    await screen.findByAltText('Syntax-highlighted code preview')

    await user.type(codeField(), '\n// custom marker')
    unmount()

    render(<CodeSnippetWidget instanceId="test" mode="grid" />)
    expect((codeField() as HTMLTextAreaElement).value).toContain('// custom marker')
  })
})

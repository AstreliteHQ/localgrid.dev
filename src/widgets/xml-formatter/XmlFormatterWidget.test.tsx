import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import XmlFormatterWidget from './XmlFormatterWidget'
import { EditorView } from '@codemirror/view'
import { setCodeMirrorValue } from '@/test/codemirror'

describe('XmlFormatterWidget', () => {
  it('starts with the sample XML, view defaulted to Plain (no output panel)', () => {
    render(<XmlFormatterWidget instanceId="test" mode="grid" />)

    expect(screen.getByRole('textbox', { name: /xml input/i })).toHaveTextContent('catalog')
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /xml output/i })).not.toBeInTheDocument()
  })

  it('renders the sample XML as a tree once switched to Tree view', async () => {
    const user = userEvent.setup()
    render(<XmlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Tree' }))
    const tree = screen.getByRole('tree')

    // Elements keep their own markup shape rather than being flattened into
    // JSON-style `@attr`/`#text` keys, and attributes are their own rows.
    expect(within(tree).getByText('catalog')).toBeInTheDocument()
    expect(within(tree).getAllByText('id').length).toBeGreaterThan(0)
    expect(within(tree).getByText('"bk101"')).toBeInTheDocument()
  })

  it('shows an error instead of the tree for invalid XML', async () => {
    const user = userEvent.setup()
    const { container } = render(<XmlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Tree' }))
    const input = screen.getByRole('textbox', { name: /xml input/i })
    setCodeMirrorValue(input, '<root><a>unclosed</root>')

    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.queryByText(/output will appear here/i)).not.toBeInTheDocument()
    // Exact wording comes from DOMParser's own error and isn't worth pinning
    // down exactly — just confirm the error-styled paragraph (ErrorMessage)
    // rendered instead of the placeholder/tree above.
    expect(container.querySelector('p.text-destructive')).not.toBeNull()
  })

  it('renders a compact single-line output in Minified view', async () => {
    const user = userEvent.setup()
    render(<XmlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Minified' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: /xml input/i }), '<root>\n  <hello>world</hello>\n</root>')

    expect(screen.getByRole('textbox', { name: /xml output/i })).toHaveValue('<root><hello>world</hello></root>')
  })

  it('renders indented output in Pretty view', async () => {
    const user = userEvent.setup()
    render(<XmlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Pretty' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: /xml input/i }), '<root><hello>world</hello></root>')

    expect(screen.getByRole('textbox', { name: /xml output/i })).toHaveValue('<root>\n  <hello>world</hello>\n</root>')
  })

  it('shows a placeholder instead of an error for empty input', async () => {
    const user = userEvent.setup()
    render(<XmlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Tree' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: /xml input/i }), '')

    expect(screen.getByText(/output will appear here/i)).toBeInTheDocument()
  })
  it('replaces the input with the output when Reuse is clicked', async () => {
    const user = userEvent.setup()
    render(<XmlFormatterWidget instanceId="reuse" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Pretty' }))
    const input = screen.getByRole('textbox', { name: /xml input/i })
    setCodeMirrorValue(input, '<a><b>1</b></a>')
    await user.click(screen.getByRole('button', { name: /reuse/i }))

    await waitFor(() => expect(EditorView.findFromDOM(input)?.state.doc.toString()).toBe('<a>\n  <b>1</b>\n</a>'))
  })

  it('switches between stacked and side-by-side panes', async () => {
    const user = userEvent.setup()
    render(<XmlFormatterWidget instanceId="split" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Pretty' }))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')

    await user.click(screen.getByRole('button', { name: /side by side/i }))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTree } from './DataTree'
import { buildJsonTree, buildXmlTree } from './treeModel'

const SAMPLE = {
  id: '8f14e45f-ea8b-4f1e-9c0a-2b6d7c3e5a91',
  url: 'https://localgrid.dev',
  theme: { accent: '#38bdf8', mode: 'dark' },
  tags: ['json', 'xml'],
  deep: { level2: { level3: { leaf: 'bottom' } } },
}

function renderJson(value: unknown = SAMPLE) {
  return render(<DataTree root={buildJsonTree(value)} label="JSON tree" />)
}

function row(name: string | RegExp): HTMLElement {
  return screen.getByText(name).closest('[role="treeitem"]') as HTMLElement
}

describe('DataTree', () => {
  it('renders keys and values, expanded to a couple of levels by default', () => {
    renderJson()

    expect(screen.getByText('theme')).toBeInTheDocument()
    expect(screen.getByText('"dark"')).toBeInTheDocument()
    // Deeper levels start collapsed, so a deep document opens readable
    // instead of as a wall of rows.
    expect(screen.getByText('level3')).toBeInTheDocument()
    expect(screen.queryByText('"bottom"')).not.toBeInTheDocument()
  })

  it('shows how big each container is without expanding it', () => {
    renderJson()

    expect(within(row('theme')).getByText('2 keys')).toBeInTheDocument()
    expect(within(row('tags')).getByText('2 strings')).toBeInTheDocument()
  })

  it('expands and collapses a branch on its chevron', async () => {
    const user = userEvent.setup()
    renderJson()

    await user.click(screen.getByRole('button', { name: /expand level3/i }))
    expect(screen.getByText('leaf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /collapse level3/i }))
    expect(screen.queryByText('leaf')).not.toBeInTheDocument()
  })

  it('expands and collapses everything from the toolbar', async () => {
    const user = userEvent.setup()
    renderJson()

    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByText('"bottom"')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    // Top-level keys stay listed; everything under them folds away.
    expect(screen.getByText('theme')).toBeInTheDocument()
    expect(screen.queryByText('"dark"')).not.toBeInTheDocument()
  })

  it('filters to matching nodes and keeps their ancestors for context', async () => {
    const user = userEvent.setup()
    renderJson()

    await user.type(screen.getByRole('textbox', { name: /filter json tree/i }), 'bottom')

    // The match, plus the chain needed to locate it, and nothing else. The
    // matched run is wrapped in its own <mark>, which is why the value's
    // text is queried in pieces here.
    expect(screen.getByText('bottom').tagName).toBe('MARK')
    expect(screen.getByText('deep')).toBeInTheDocument()
    expect(screen.queryByText('theme')).not.toBeInTheDocument()
  })

  it('says so when a filter matches nothing', async () => {
    const user = userEvent.setup()
    renderJson()

    await user.type(screen.getByRole('textbox', { name: /filter json tree/i }), 'nosuchkey')
    expect(screen.getByText(/no key or value matches/i)).toBeInTheDocument()
  })

  it('annotates well-known fields: a link is followable and a color gets a swatch', () => {
    const { container } = renderJson()

    expect(screen.getByRole('link', { name: '"https://localgrid.dev"' })).toHaveAttribute(
      'href',
      'https://localgrid.dev',
    )
    expect(within(row('accent')).getByText('"#38bdf8"')).toBeInTheDocument()
    expect(container.querySelector('[style*="rgb(56, 189, 248)"], [style*="#38bdf8"]')).not.toBeNull()
  })

  it('summarizes the whole document while nothing is selected, then the selected node', async () => {
    const user = userEvent.setup()
    renderJson()

    expect(screen.getByText(/nodes ·/)).toHaveTextContent('depth 4')

    await user.click(screen.getByText('theme'))
    expect(screen.getByText('$.theme')).toBeInTheDocument()
    expect(screen.getByText(/object · 2 direct/)).toBeInTheDocument()
  })

  it("labels the selected node's copy path and copy value buttons apart", async () => {
    const user = userEvent.setup()
    renderJson()

    await user.click(screen.getByText('theme'))

    await user.click(screen.getByRole('button', { name: 'Path' }))
    expect(await navigator.clipboard.readText()).toBe('$.theme')

    await user.click(screen.getByRole('button', { name: 'Value' }))
    expect(JSON.parse(await navigator.clipboard.readText())).toEqual(SAMPLE.theme)
  })

  it('walks and toggles rows from the keyboard', async () => {
    const user = userEvent.setup()
    renderJson({ first: { inner: 1 }, second: 2 })

    await user.click(screen.getByText('first'))
    await user.keyboard('{ArrowLeft}')
    expect(screen.queryByText('inner')).not.toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('inner')).toBeInTheDocument()

    await user.keyboard('{End}')
    expect(row('second')).toHaveAttribute('aria-selected', 'true')
  })

  it('stays reachable by keyboard after the selected row is filtered away', async () => {
    const user = userEvent.setup()
    renderJson()

    await user.click(screen.getByText('"dark"'))
    const tree = screen.getByRole('tree')
    expect(tree).toHaveAttribute('tabindex', '-1')

    // The selected row is gone, so no row carries tabIndex 0 any more: the
    // tree itself has to take the tab stop back, or the viewer drops out of
    // the tab order entirely.
    await user.type(screen.getByRole('textbox', { name: /filter json tree/i }), 'localgrid')
    expect(screen.getByRole('tree')).toHaveAttribute('tabindex', '0')
  })

  it('keeps a filter match visible in a value too long to show whole', async () => {
    const user = userEvent.setup()
    const buried = `${'x'.repeat(400)}needle${'y'.repeat(400)}`
    renderJson({ blob: buried })

    await user.type(screen.getByRole('textbox', { name: /filter json tree/i }), 'needle')

    // Truncating from the start would leave this row matched but with
    // nothing highlighted, which reads as a false positive.
    expect(screen.getByText('needle').tagName).toBe('MARK')
  })

  it('exposes tree semantics for assistive technology', () => {
    renderJson({ parent: { child: 1 } })

    const tree = screen.getByRole('tree', { name: 'JSON tree' })
    const parent = within(tree).getByText('parent').closest('[role="treeitem"]')!
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    expect(parent).toHaveAttribute('aria-level', '1')
    expect(within(tree).getByText('child').closest('[role="treeitem"]')).toHaveAttribute('aria-level', '2')
  })

  it('renders an XML document as markup, with attribute rows of their own', () => {
    const doc = new DOMParser().parseFromString('<book id="bk101"><title>Rain</title></book>', 'application/xml')
    render(<DataTree root={buildXmlTree(doc)} label="XML tree" />)

    expect(screen.getByText('book')).toBeInTheDocument()
    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('"bk101"')).toBeInTheDocument()
    expect(screen.getByText('"Rain"')).toBeInTheDocument()
  })

  it('drops its chrome when embedded (JWT decoder blocks)', () => {
    render(<DataTree root={buildJsonTree({ a: 1 })} label="Header tree" toolbar={false} statusBar={false} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
    expect(screen.getByRole('tree', { name: 'Header tree' })).toBeInTheDocument()
  })
})

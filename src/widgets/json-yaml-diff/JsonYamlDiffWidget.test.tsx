import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JsonYamlDiffWidget from './JsonYamlDiffWidget'
import { setCodeMirrorValue } from '@/test/codemirror'

const setSides = (format: 'JSON' | 'YAML', original: string, changed: string) => {
  setCodeMirrorValue(screen.getByRole('textbox', { name: `Original ${format}` }), original)
  setCodeMirrorValue(screen.getByRole('textbox', { name: `Changed ${format}` }), changed)
}

describe('JsonYamlDiffWidget', () => {
  it('opens on the JSON samples with their changes listed', () => {
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    const list = screen.getByRole('list', { name: 'Changes' })
    expect(within(list).getByLabelText('changed $.version')).toHaveTextContent('"0.6.0"→"0.7.0"')
    expect(within(list).getByLabelText('added $.scripts.test')).toBeInTheDocument()
    expect(within(list).getByLabelText('removed $.private')).toBeInTheDocument()
  })

  it('reports documents that only differ in key order and formatting as equivalent', () => {
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    setSides('JSON', '{"a": 1, "b": [1, 2]}', '{\n  "b": [1,2],\n  "a": 1\n}')

    expect(screen.getByText('The documents are equivalent')).toBeInTheDocument()
    expect(screen.getByText('No differences')).toBeInTheDocument()
  })

  it('shows a parse error for the side that is invalid', () => {
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    setSides('JSON', '{"a": 1}', '{"a": ')

    expect(screen.getByText(/^Changed:/)).toBeInTheDocument()
    expect(screen.queryByText(/^Original:/)).not.toBeInTheDocument()
  })

  it('switches the untouched samples to YAML along with the format', async () => {
    const user = userEvent.setup()
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'YAML' }))

    expect(screen.getByRole('textbox', { name: 'Original YAML' })).toHaveTextContent('kind: Deployment')
    expect(screen.getByLabelText('changed $.spec.replicas')).toHaveTextContent('2→3')
    expect(screen.getByLabelText('changed $.spec.template.spec.containers[0].image')).toBeInTheDocument()
  })

  it('keeps edited input when switching format, and accepts JSON in YAML mode', async () => {
    const user = userEvent.setup()
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    setSides('JSON', '{"replicas": 2}', '{"replicas": 2}')
    await user.click(screen.getByRole('button', { name: 'YAML' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: 'Changed YAML' }), 'replicas: 3')

    expect(screen.getByLabelText('changed $.replicas')).toHaveTextContent('2→3')
  })

  it('ignores array order when asked to', async () => {
    const user = userEvent.setup()
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    setSides('JSON', '[1, 2, 3]', '[3, 2, 1]')
    expect(screen.queryByText('No differences')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Ignore array order' }))
    expect(screen.getByText('No differences')).toBeInTheDocument()
  })

  it('shows the merged tree with unchanged branches folded', async () => {
    const user = userEvent.setup()
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    setSides('JSON', '{"same": {"x": 1}, "edited": {"y": 1}}', '{"same": {"x": 1}, "edited": {"y": 2}}')
    await user.click(screen.getByRole('button', { name: 'Tree' }))

    const tree = screen.getByRole('tree', { name: 'Diff tree' })
    expect(within(tree).getByLabelText('changed $.edited.y')).toBeInTheDocument()
    expect(within(tree).queryByLabelText('unchanged $.same.x')).not.toBeInTheDocument()

    await user.click(within(tree).getByRole('button', { name: 'Expand $.same' }))
    expect(within(tree).getByLabelText('unchanged $.same.x')).toBeInTheDocument()
  })

  it('swaps the two documents', async () => {
    const user = userEvent.setup()
    render(<JsonYamlDiffWidget instanceId="test" mode="grid" />)

    setSides('JSON', '{"a": 1}', '{}')
    expect(screen.getByLabelText('removed $.a')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Swap original and changed documents' }))
    expect(screen.getByLabelText('added $.a')).toBeInTheDocument()
  })
})

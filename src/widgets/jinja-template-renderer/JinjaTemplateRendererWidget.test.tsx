import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import JinjaTemplateRendererWidget from './JinjaTemplateRendererWidget'

function templateField() {
  return screen.getByRole('textbox', { name: 'Jinja template' })
}

function dataField() {
  return screen.getByRole('textbox', { name: 'Template data' })
}

function output() {
  return screen.queryByRole('textbox', { name: 'Rendered output' })
}

describe('JinjaTemplateRendererWidget', () => {
  it('renders the sample template and data it opens with', () => {
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    expect(output()?.textContent).toContain('Hello Ada!')
    expect(output()?.textContent).toContain('- json')
  })

  it('re-renders as the template changes', () => {
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(templateField(), '{{ name }} says hi')

    expect(output()).toHaveValue('ada says hi')
  })

  it('accepts YAML data once switched over', async () => {
    const user = userEvent.setup()
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(templateField(), '{{ greeting }}')
    await user.click(screen.getByRole('button', { name: 'YAML' }))
    setCodeMirrorValue(dataField(), 'greeting: bonjour')

    expect(output()).toHaveValue('bonjour')
  })

  it('auto-converts the existing data to the new format on switch, instead of leaving it stale', async () => {
    const user = userEvent.setup()
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'YAML' }))

    expect(dataField()).toHaveTextContent('name: ada')
    expect(output()?.textContent).toContain('Hello Ada!')

    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(output()?.textContent).toContain('Hello Ada!')
  })

  it('leaves data untouched on a format switch when it does not actually parse as the format it is in', async () => {
    const user = userEvent.setup()
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(dataField(), '{not valid json')
    await user.click(screen.getByRole('button', { name: 'YAML' }))

    expect(dataField()).toHaveTextContent('{not valid json')
  })

  it('shows a data error without leaving a stale output field showing', () => {
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(dataField(), '{not valid json')

    expect(screen.getByText(/invalid json data/i)).toBeInTheDocument()
    expect(output()).not.toBeInTheDocument()
  })

  it('shows a template syntax error', () => {
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(templateField(), '{% for x in items %}{{ x }}')

    expect(screen.queryByText(/invalid json data/i)).not.toBeInTheDocument()
    expect(output()).not.toBeInTheDocument()
  })

  it('rejects a top-level array as data, since keys become template variables', () => {
    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(dataField(), '[1, 2, 3]')

    expect(screen.getByText(/must be an object/i)).toBeInTheDocument()
  })

  it('keeps its template and data across a remount of the same instance', () => {
    const { unmount } = render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(templateField(), 'custom template {{ name }}')
    unmount()

    render(<JinjaTemplateRendererWidget instanceId="test" mode="grid" />)
    expect(templateField()).toHaveTextContent('custom template {{ name }}')
  })
})

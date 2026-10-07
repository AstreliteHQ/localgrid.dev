import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import JsonSchemaValidatorWidget from './JsonSchemaValidatorWidget'

function schemaField() {
  return screen.getByRole('textbox', { name: /json schema/i })
}

function documentField() {
  return screen.getByRole('textbox', { name: /document to validate/i })
}

describe('JsonSchemaValidatorWidget', () => {
  it('validates the sample schema and document it opens with', () => {
    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    expect(screen.getByText(/document matches the schema/i)).toBeInTheDocument()
  })

  it('lists every validation issue with its path once the document breaks the schema', () => {
    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(documentField(), '{"age": -1}')

    expect(screen.queryByText(/document matches the schema/i)).not.toBeInTheDocument()
    const issues = screen.getByLabelText('Validation issues')
    expect(issues).toHaveTextContent('/age')
    expect(issues).toHaveTextContent('>= 0')
  })

  it('shows a schema error distinctly from a document error', () => {
    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(schemaField(), '{ not json')

    expect(screen.getByText(/schema error/i)).toBeInTheDocument()
  })

  it('shows a document error for input that cannot be parsed', () => {
    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(documentField(), '{ not json')

    expect(screen.getByText(/document error/i)).toBeInTheDocument()
  })

  it('validates the document as YAML once switched to that format', async () => {
    const user = userEvent.setup()
    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'YAML' }))
    setCodeMirrorValue(documentField(), 'id: abc\nname: Ada Lovelace\nage: 36\n')

    expect(screen.getByText(/document matches the schema/i)).toBeInTheDocument()
  })

  it('reports a YAML parse error instead of silently falling back to JSON parsing', async () => {
    const user = userEvent.setup()
    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'YAML' }))
    setCodeMirrorValue(documentField(), '- not\n  valid: [yaml')

    expect(screen.getByText(/document error/i)).toBeInTheDocument()
  })

  it('keeps its inputs and format across a remount of the same instance', () => {
    const { unmount } = render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(documentField(), '{"id": "x", "name": "Grace"}')
    unmount()

    render(<JsonSchemaValidatorWidget instanceId="test" mode="grid" />)
    expect(documentField()).toHaveTextContent('"name": "Grace"')
  })
})

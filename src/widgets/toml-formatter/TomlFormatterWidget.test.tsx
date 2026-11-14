import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView } from '@codemirror/view'
import TomlFormatterWidget from './TomlFormatterWidget'
import { setCodeMirrorValue } from '@/test/codemirror'

describe('TomlFormatterWidget', () => {
  it('starts with the sample TOML shown as a tree', () => {
    render(<TomlFormatterWidget instanceId="test" mode="grid" />)

    expect(screen.getByRole('textbox', { name: /toml input/i })).toHaveTextContent('localgrid')
    expect(within(screen.getByRole('tree')).getByText('"localgrid"')).toBeInTheDocument()
  })

  it('converts TOML to JSON', async () => {
    const user = userEvent.setup()
    render(<TomlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'To JSON' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: /toml input/i }), 'hello = "world"')

    expect(screen.getByRole('textbox', { name: /json output/i })).toHaveValue('{\n  "hello": "world"\n}')
  })

  it('shows an error instead of output for invalid TOML', () => {
    render(<TomlFormatterWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(screen.getByRole('textbox', { name: /toml input/i }), 'a = [')

    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.getByText(/invalid toml document/i)).toBeInTheDocument()
  })

  it('carries the document across when switching to From JSON', async () => {
    const user = userEvent.setup()
    render(<TomlFormatterWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(screen.getByRole('textbox', { name: /toml input/i }), 'hello = "world"')
    await user.click(screen.getByRole('button', { name: 'From JSON' }))

    // The editor holds back external value changes for a short moment after
    // typing, so wait for the carried-over document to land.
    const editor = EditorView.findFromDOM(screen.getByRole('textbox', { name: /json input/i }))
    await waitFor(() => expect(editor?.state.doc.toString()).toBe('{\n  "hello": "world"\n}'))
    expect(screen.getByRole('textbox', { name: /toml output/i })).toHaveValue('hello = "world"\n')
  })

  it('formats TOML in Formatted view', async () => {
    const user = userEvent.setup()
    render(<TomlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Formatted' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: /toml input/i }), 'a.b   =  1')

    expect(screen.getByRole('textbox', { name: /toml output/i })).toHaveValue('[a]\nb = 1\n')
  })

  it('formats integers beyond 2^53 exactly in Formatted view', async () => {
    const user = userEvent.setup()
    render(<TomlFormatterWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Formatted' }))
    setCodeMirrorValue(screen.getByRole('textbox', { name: /toml input/i }), 'big = 9223372036854775807\nrate = 1.0')

    expect(screen.getByRole('textbox', { name: /toml output/i })).toHaveValue('big = 9223372036854775807\nrate = 1.0\n')
  })
})

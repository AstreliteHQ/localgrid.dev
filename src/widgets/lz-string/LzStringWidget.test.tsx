import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LZString from 'lz-string'
import LzStringWidget from './LzStringWidget'

describe('LzStringWidget', () => {
  it('starts empty, with no output', () => {
    render(<LzStringWidget instanceId="test" mode="grid" />)
    expect(screen.getByPlaceholderText('Output')).toHaveValue('')
  })

  it('compresses text by default', async () => {
    const user = userEvent.setup()
    render(<LzStringWidget instanceId="test" mode="grid" />)

    await user.type(screen.getByPlaceholderText(/text to compress/i), 'hello')

    expect(screen.getByPlaceholderText('Output')).toHaveValue(LZString.compressToEncodedURIComponent('hello'))
  })

  it('decompresses back to text once Decompress is selected', async () => {
    const user = userEvent.setup()
    render(<LzStringWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Decompress' }))
    await user.type(
      screen.getByPlaceholderText(/lz-string to decompress/i),
      LZString.compressToEncodedURIComponent('hello world'),
    )

    expect(screen.getByPlaceholderText('Output')).toHaveValue('hello world')
  })

  it('shows an error instead of output for invalid input', async () => {
    const user = userEvent.setup()
    render(<LzStringWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Decompress' }))
    await user.type(screen.getByPlaceholderText(/lz-string to decompress/i), 'not valid lz-string!!!')

    expect(screen.getByPlaceholderText('Output')).toHaveValue('Invalid LZ-String input')
  })

  it('rejects plain text that merely fits the alphabet, rather than showing garbage output', async () => {
    // "helloworld" decompresses to a couple of garbage characters despite
    // never having been compressed — the round-trip check should catch it.
    const user = userEvent.setup()
    render(<LzStringWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Decompress' }))
    await user.type(screen.getByPlaceholderText(/lz-string to decompress/i), 'helloworld')

    expect(screen.getByPlaceholderText('Output')).toHaveValue('Invalid LZ-String input')
  })

  it('round-trips unicode text correctly', async () => {
    const user = userEvent.setup()
    render(<LzStringWidget instanceId="test" mode="grid" />)

    await user.type(screen.getByPlaceholderText(/text to compress/i), 'héllo 世界')

    const compressedValue = (screen.getByPlaceholderText('Output') as HTMLTextAreaElement).value
    expect(compressedValue).not.toBe('')

    await user.click(screen.getByRole('button', { name: 'Decompress' }))
    await user.clear(screen.getByPlaceholderText(/lz-string to decompress/i))
    await user.type(screen.getByPlaceholderText(/lz-string to decompress/i), compressedValue)

    expect(screen.getByPlaceholderText('Output')).toHaveValue('héllo 世界')
  })

  it('shows an error instead of crashing on input the library throws on, e.g. "z"', async () => {
    const user = userEvent.setup()
    render(<LzStringWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'Decompress' }))
    await user.type(screen.getByPlaceholderText(/lz-string to decompress/i), 'z')

    expect(screen.getByPlaceholderText('Output')).toHaveValue('Invalid LZ-String input')
  })
})

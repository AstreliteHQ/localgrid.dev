import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MaterialPaletteWidget from './MaterialPaletteWidget'

function hexField() {
  return screen.getByLabelText(/seed color hex/i)
}

describe('MaterialPaletteWidget', () => {
  it('starts at the default blue with the full tone and accent scale rendered', () => {
    render(<MaterialPaletteWidget instanceId="test" mode="grid" />)

    expect(hexField()).toHaveValue('#2196f3')
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(screen.getByText('A700')).toBeInTheDocument()
    // 10 tones + 4 accents, each rendered as its own swatch button.
    expect(screen.getAllByTitle(/^Copy #/)).toHaveLength(14)
  })

  it('regenerates the palette when a new hex is typed', async () => {
    const user = userEvent.setup()
    render(<MaterialPaletteWidget instanceId="test" mode="grid" />)

    await user.clear(hexField())
    await user.type(hexField(), '#ff0000')

    expect(screen.getByTitle('Copy #ff0000')).toBeInTheDocument()
  })

  it('shows an error instead of a palette while the hex is invalid/in progress', async () => {
    const user = userEvent.setup()
    render(<MaterialPaletteWidget instanceId="test" mode="grid" />)

    await user.clear(hexField())
    await user.type(hexField(), 'not-a-color')

    expect(screen.getByText(/enter a valid color/i)).toBeInTheDocument()
    expect(screen.queryByText('500')).not.toBeInTheDocument()
  })

  it('picking a color with the native color input regenerates the palette', () => {
    render(<MaterialPaletteWidget instanceId="test" mode="grid" />)

    const nativePicker = screen.getByLabelText('Pick a seed color')
    Object.defineProperty(nativePicker, 'value', { value: '#00ff00', configurable: true })
    nativePicker.dispatchEvent(new Event('change', { bubbles: true }))

    expect(hexField()).toHaveValue('#00ff00')
  })

  it('copies a swatch hex to the clipboard on click', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<MaterialPaletteWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByTitle('Copy #2196f3'))

    expect(writeText).toHaveBeenCalledWith('#2196f3')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })
})

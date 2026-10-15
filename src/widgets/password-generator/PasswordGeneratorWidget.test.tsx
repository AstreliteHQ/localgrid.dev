import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasswordGeneratorWidget from './PasswordGeneratorWidget'

function getOutput() {
  return screen.getByPlaceholderText<HTMLInputElement>(/generated password/i)
}

// fireEvent.change is just a direct, one-step way to set the length field
// for tests that don't care about the keystroke sequence itself — see the
// "backspacing" test below for coverage of real keystroke-by-keystroke
// editing (NumberField.test.tsx covers that field in isolation).
function setLength(value: string) {
  fireEvent.change(screen.getByLabelText(/length/i), { target: { value } })
}

describe('PasswordGeneratorWidget', () => {
  it('starts empty, with no password generated', () => {
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)
    expect(getOutput()).toHaveValue('')
  })

  it('generates a 16-character password by default once Generate is clicked', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /generate/i }))

    expect(getOutput().value).toHaveLength(16)
  })

  it('generates a password matching the requested length', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    setLength('32')
    await user.click(screen.getByRole('button', { name: /generate/i }))

    expect(getOutput().value).toHaveLength(32)
  })

  it('disables Generate and shows an error once every character set is turned off', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    // Defaults are A-Z, a-z, 0-9 on and !@# off — turn off the three that are on.
    await user.click(screen.getByRole('button', { name: 'A-Z' }))
    await user.click(screen.getByRole('button', { name: 'a-z' }))
    await user.click(screen.getByRole('button', { name: '0-9' }))

    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
    expect(screen.getByText(/select at least one character set/i)).toBeInTheDocument()
  })

  it('only uses digits once every other character set is turned off', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'A-Z' }))
    await user.click(screen.getByRole('button', { name: 'a-z' }))
    await user.click(screen.getByRole('button', { name: /generate/i }))

    expect(getOutput().value).toMatch(/^\d{16}$/)
  })

  it('excludes ambiguous characters once that option is enabled', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: '!@#' }))
    await user.click(screen.getByRole('button', { name: /exclude similar characters/i }))
    setLength('128')
    await user.click(screen.getByRole('button', { name: /generate/i }))

    expect(getOutput().value).not.toMatch(/[Il1O0o|]/)
  })

  it('shows a strength label that reacts to the current settings', () => {
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    setLength('4')

    expect(screen.getByText(/very weak/i)).toBeInTheDocument()
  })

  it('lets the length be reduced by backspacing and retyping a smaller number', async () => {
    // Regression test for a real bug report: backspacing "5" down to blank
    // used to clamp-and-redisplay "4" (the field's min) on that very
    // keystroke, so the next keystroke landed as an append ("44") instead
    // of a replacement — the length could never actually be lowered to 4.
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    const lengthInput = screen.getByLabelText(/length/i)
    setLength('5')
    await user.click(lengthInput)
    await user.keyboard('{End}{Backspace}4')

    expect(lengthInput).toHaveValue(4)
  })

  it('masks the generated password until the reveal toggle is pressed', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /generate/i }))
    expect(getOutput()).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(getOutput()).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(getOutput()).toHaveAttribute('type', 'password')
  })

  it('copies the real password while it is masked', async () => {
    const user = userEvent.setup()
    render(<PasswordGeneratorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /generate/i }))
    await user.click(screen.getByRole('button', { name: /copy/i }))

    await expect(navigator.clipboard.readText()).resolves.toBe(getOutput().value)
  })
})

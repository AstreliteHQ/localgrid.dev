import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileSizeConverterWidget from './FileSizeConverterWidget'

/** Scopes a value lookup to the row for a given unit label. The unit
 * `<select>` carries an `<option>` with the same text as every row's own
 * label span, so the label itself has to be found among `<span>`s only;
 * the value lookup then further scopes to that row, since several rows can
 * show the same digits (e.g. an empty state renders "—" everywhere). */
function rowValue(labelPattern: RegExp): string | null {
  const labelEl = screen.getAllByText(labelPattern).find((el) => el.tagName === 'SPAN')
  if (!labelEl) throw new Error(`no row label span found matching ${labelPattern}`)
  const row = labelEl.closest('div')
  if (!row) throw new Error(`no row found for label matching ${labelPattern}`)
  return within(row).getByText(/^-?[\d.,e-]+$|^—$/).textContent
}

describe('FileSizeConverterWidget', () => {
  it('starts at 1 GB, converted into every unit at once', () => {
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    expect(screen.getByLabelText(/unit/i)).toHaveValue('GB')
    expect(rowValue(/^Bytes$/)).toBe('1000000000')
    expect(rowValue(/^Megabytes$/)).toBe('1000')
    expect(rowValue(/^Gigabytes$/)).toBe('1')
  })

  it('shows the decimal/binary gap a 1 GB file is known for', () => {
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    // 1 GB reads as ~931 MiB and ~0.93 GiB, not 1000/1: this gap is the
    // whole reason the widget shows both systems side by side.
    expect(rowValue(/^Mebibytes$/)).toBe('953.674316')
    expect(rowValue(/^Gibibytes$/)).toBe('0.931323')
  })

  it('updates every unit when the value changes', async () => {
    const user = userEvent.setup()
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText(/size/i))
    await user.type(screen.getByLabelText(/size/i), '500')

    expect(rowValue(/^Gigabytes$/)).toBe('500')
    expect(rowValue(/^Megabytes$/)).toBe('500000')
  })

  it('reinterprets the same number when the unit changes', async () => {
    const user = userEvent.setup()
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    await user.selectOptions(screen.getByLabelText(/unit/i), 'MB')

    // Same "1" the field already held, now read as 1 MB instead of 1 GB.
    expect(rowValue(/^Bytes$/)).toBe('1000000')
    expect(rowValue(/^Kilobytes$/)).toBe('1000')
  })

  it('converts bits correctly, a byte being eight of them', async () => {
    const user = userEvent.setup()
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    await user.selectOptions(screen.getByLabelText(/unit/i), 'B')
    await user.clear(screen.getByLabelText(/size/i))
    await user.type(screen.getByLabelText(/size/i), '1')

    expect(rowValue(/^Bits$/)).toBe('8')
  })

  it('shows an error for input that is not a number', async () => {
    const user = userEvent.setup()
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText(/size/i))
    await user.type(screen.getByLabelText(/size/i), 'abc')

    expect(screen.getByText(/enter a number/i)).toBeInTheDocument()
    expect(rowValue(/^Gigabytes$/)).toBe('—')
  })

  it('shows placeholders rather than an error for an empty field', async () => {
    const user = userEvent.setup()
    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText(/size/i))

    expect(screen.queryByText(/enter a number/i)).not.toBeInTheDocument()
    expect(rowValue(/^Gigabytes$/)).toBe('—')
  })

  it('keeps its value and unit across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<FileSizeConverterWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText(/size/i))
    await user.type(screen.getByLabelText(/size/i), '250')
    await user.selectOptions(screen.getByLabelText(/unit/i), 'TiB')
    unmount()

    render(<FileSizeConverterWidget instanceId="test" mode="grid" />)
    expect(screen.getByLabelText(/size/i)).toHaveValue('250')
    expect(screen.getByLabelText(/unit/i)).toHaveValue('TiB')
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorldClockWidget from './WorldClockWidget'

// Default rows depend on the host's own time zone (see defaultCityIds), so
// tests here never hardcode which city to add/remove — a city that's a
// default on one host's clock could be missing from the picker on
// another's. Instead they read whichever option the picker actually
// offers first and drive assertions off that, so the suite is correct
// under any host time zone rather than merely unlikely to fail under most.
//
// Opens the add-city combobox's popup and picks its first listed option —
// the combobox equivalent of the old `firstAvailableCity` + `selectOptions`
// pair, now that picking a city means typing/opening then clicking an
// option instead of using a native `<select>`.
async function pickFirstAvailableCity(user: ReturnType<typeof userEvent.setup>): Promise<{ name: string }> {
  await user.click(screen.getByLabelText(/add city/i))
  const option = await screen.findAllByRole('option')
  const name = option[0].textContent?.split(',')[0]?.trim() ?? ''
  await user.click(option[0])
  return { name }
}

function parseOptionLabel(option: Element): { city: string; country: string } {
  const [city, country] = (option.textContent ?? '').split(',').map((s) => s.trim())
  return { city, country }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function optionNameRegExp({ city, country }: { city: string; country: string }): RegExp {
  return new RegExp(`^${escapeRegExp(city)}, ${escapeRegExp(country)}$`, 'i')
}

describe('WorldClockWidget', () => {
  it('renders the add-city picker and a reference time field', () => {
    render(<WorldClockWidget instanceId="test" mode="grid" />)
    expect(screen.getByLabelText(/add city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reference time/i)).toBeInTheDocument()
    expect(screen.getByText(/live/i)).toBeInTheDocument()
  })

  it('adds a picked city to the list', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const { name } = await pickFirstAvailableCity(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(screen.getByText(name)).toBeInTheDocument()
    // Removed from the picker once it's already on the board.
    await user.click(screen.getByLabelText(/add city/i))
    expect(screen.queryByRole('option', { name: new RegExp(`^${name},`) })).not.toBeInTheDocument()
  })

  it('removes a city from the list', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const { name } = await pickFirstAvailableCity(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(screen.getByText(name)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Remove ${name}` }))

    expect(screen.queryByText(name)).not.toBeInTheDocument()
    // Back in the picker, available to add again.
    await user.click(screen.getByLabelText(/add city/i))
    expect(screen.getByRole('option', { name: new RegExp(`^${name},`) })).toBeInTheDocument()
  })

  it('does not add the same city twice', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const { name } = await pickFirstAvailableCity(user)
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(screen.getAllByText(name)).toHaveLength(1)
  })

  it('lets typing filter the add-city picker by city or country', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const addField = screen.getByLabelText(/add city/i)
    await user.click(addField)
    const initialOptions = await screen.findAllByRole('option')
    const target = parseOptionLabel(initialOptions[0])
    // A city from a different country than `target`, to prove typing
    // actually narrows the list rather than always showing everything —
    // picked from the live options rather than hardcoded, same reasoning
    // as `pickFirstAvailableCity` above.
    const other = initialOptions.map(parseOptionLabel).find((o) => o.country !== target.country)

    await user.type(addField, target.country)

    expect(await screen.findByRole('option', { name: optionNameRegExp(target) })).toBeInTheDocument()
    if (other) {
      expect(screen.queryByRole('option', { name: optionNameRegExp(other) })).not.toBeInTheDocument()
    }
  })

  it('switches to previewing a custom time when the reference time is edited', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    await user.type(dateField, '2024-01-15T10:30')

    expect(screen.getByText(/previewing a custom time/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^now$/i })).toBeEnabled()
  })

  it('jumps back to live time when Now is clicked', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    await user.type(dateField, '2024-01-15T10:30')
    expect(screen.getByText(/previewing a custom time/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^now$/i }))

    expect(screen.getByText(/^live$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^now$/i })).toBeDisabled()
  })

  it('shifts the reference time forward by 1 hour', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    await user.type(dateField, '2024-01-15T10:30')

    await user.click(screen.getByRole('button', { name: /forward 1 hour/i }))

    expect(dateField).toHaveValue('2024-01-15T11:30')
  })

  it('shifts the reference time back by 1 hour', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    await user.type(dateField, '2024-01-15T10:30')

    await user.click(screen.getByRole('button', { name: /back 1 hour/i }))

    expect(dateField).toHaveValue('2024-01-15T09:30')
  })

  it('stacks repeated hour shifts', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    await user.type(dateField, '2024-01-15T23:30')

    await user.click(screen.getByRole('button', { name: /forward 1 hour/i }))
    await user.click(screen.getByRole('button', { name: /forward 1 hour/i }))

    // Crosses midnight into the next day, not just wrapping the hour.
    expect(dateField).toHaveValue('2024-01-16T01:30')
  })

  it('switches out of live mode when shifting the hour from "now"', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /forward 1 hour/i }))

    expect(screen.getByText(/previewing a custom time/i)).toBeInTheDocument()
  })

  it('does not switch out of live mode while the reference time field is merely cleared', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)

    // An empty, not-yet-a-date draft shouldn't itself count as "previewing
    // a custom time" — that label (and the map/list it drives) should only
    // apply once a real instant has actually been entered.
    expect(screen.getByText(/^live$/i)).toBeInTheDocument()
    expect(screen.queryByText(/previewing a custom time/i)).not.toBeInTheDocument()
  })

  it('resets an abandoned empty edit back to the current time on blur', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    expect(dateField).toHaveValue('')

    await user.tab()

    expect(dateField).not.toHaveValue('')
    expect(screen.getByText(/^live$/i)).toBeInTheDocument()
  })

  it('keeps the previous custom time in effect while a new edit is still incomplete', async () => {
    const user = userEvent.setup()
    render(<WorldClockWidget instanceId="test" mode="grid" />)

    const dateField = screen.getByLabelText(/reference time/i)
    await user.clear(dateField)
    await user.type(dateField, '2024-01-15T10:30')
    expect(screen.getByText(/previewing a custom time/i)).toBeInTheDocument()

    // Clearing again to start a fresh edit shouldn't discard the
    // already-applied preview or freeze it on a stale instant.
    await user.clear(dateField)

    expect(screen.getByText(/previewing a custom time/i)).toBeInTheDocument()
  })
})

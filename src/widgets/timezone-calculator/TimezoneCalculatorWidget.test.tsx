import { describe, expect, it } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useIsWidgetDirty } from '@/widgets/useWidgetDirty'
import TimezoneCalculatorWidget from './TimezoneCalculatorWidget'

function copyButton() {
  return screen.getByRole('button', { name: /^copy$/i })
}

async function setTime(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('Time')
  await user.clear(field)
  await user.type(field, value)
}

describe('TimezoneCalculatorWidget', () => {
  it('converts UTC+2 to UTC, the motivating example, in 24-hour form by default', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T14:00')
    await user.selectOptions(screen.getByLabelText('From'), 'UTC+02:00')
    await user.selectOptions(screen.getByLabelText('To'), 'UTC+00:00')

    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText(/Jan 15.*UTC\+00:00/)).toBeInTheDocument()
  })

  it('switches the result to a 12-hour clock on request', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T14:00')
    await user.selectOptions(screen.getByLabelText('From'), 'UTC+02:00')
    await user.selectOptions(screen.getByLabelText('To'), 'UTC+00:00')
    await user.click(screen.getByRole('button', { name: '12h' }))

    expect(screen.getByText('12:00 PM')).toBeInTheDocument()
    expect(screen.queryByText('12:00')).not.toBeInTheDocument()
  })

  it('pads midnight as 00:00 rather than 24:00 in 24-hour form', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T00:00')
    await user.selectOptions(screen.getByLabelText('From'), 'UTC+00:00')
    await user.selectOptions(screen.getByLabelText('To'), 'UTC+00:00')

    expect(screen.getByText('00:00')).toBeInTheDocument()
  })

  it('shows a day-forward badge when the conversion crosses midnight', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T23:00')
    await user.selectOptions(screen.getByLabelText('From'), 'UTC+00:00')
    await user.selectOptions(screen.getByLabelText('To'), 'UTC+02:00')

    expect(screen.getByText('01:00')).toBeInTheDocument()
    expect(screen.getByText('+1d')).toBeInTheDocument()
  })

  it('shows a day-back badge the same way', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T00:30')
    await user.selectOptions(screen.getByLabelText('From'), 'UTC+00:00')
    await user.selectOptions(screen.getByLabelText('To'), 'UTC-02:00')

    expect(screen.getByText('-1d')).toBeInTheDocument()
  })

  it('swaps the from and to offsets', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await user.selectOptions(screen.getByLabelText('From'), 'UTC+02:00')
    await user.selectOptions(screen.getByLabelText('To'), 'UTC-05:00')
    await user.click(screen.getByRole('button', { name: 'Swap offsets' }))

    expect(screen.getByLabelText('From')).toHaveValue('-300')
    expect(screen.getByLabelText('To')).toHaveValue('120')
  })

  it('shows a prompt instead of a result when the time is cleared', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText('Time'))

    expect(screen.getByText(/enter a time to convert/i)).toBeInTheDocument()
    expect(copyButton()).toBeDisabled()
  })

  it('enables the copy button once a result is showing', async () => {
    const user = userEvent.setup()
    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T14:00')

    expect(copyButton()).toBeEnabled()
  })

  it('keeps its request across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)

    await setTime(user, '2026-01-15T14:00')
    await user.selectOptions(screen.getByLabelText('From'), 'UTC+02:00')
    unmount()

    render(<TimezoneCalculatorWidget instanceId="test" mode="grid" />)
    expect(screen.getByLabelText('Time')).toHaveValue('2026-01-15T14:00')
    expect(screen.getByLabelText('From')).toHaveValue('120')
  })

  it('stays dirty across a remount after only the date was edited', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TimezoneCalculatorWidget instanceId="dirty-remount-test" mode="grid" />)

    await setTime(user, '2026-01-15T14:00')
    unmount()

    render(<TimezoneCalculatorWidget instanceId="dirty-remount-test" mode="grid" />)

    expect(renderHook(() => useIsWidgetDirty('dirty-remount-test')).result.current).toBe(true)
  })
})

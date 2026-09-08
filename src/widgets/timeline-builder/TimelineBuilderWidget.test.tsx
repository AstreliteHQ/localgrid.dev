import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimelineBuilderWidget from './TimelineBuilderWidget'

/** Every assertion here is driven through the display zone the test itself
 * sets (UTC), never the host's, so the suite reads the same on a laptop in
 * Paris and in CI. */
async function addLines(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.clear(screen.getByLabelText(/timestamps to add/i))
  await user.type(screen.getByLabelText(/timestamps to add/i), text)
  await user.click(screen.getByRole('button', { name: /^add$/i }))
}

async function showInUtc(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/display time zone/i), 'UTC')
  await user.selectOptions(screen.getByLabelText(/input time zone/i), 'UTC')
}

/** jsdom ships no DataTransfer, and the object passed between dragstart and
 * drop is the whole contract the lane handlers are built on, so the drag
 * test supplies a minimal stand-in rather than skipping the interaction. */
class FakeDataTransfer {
  private data = new Map<string, string>()
  dropEffect = 'none'
  effectAllowed = 'all'

  get types(): string[] {
    return [...this.data.keys()]
  }

  setData(format: string, value: string) {
    this.data.set(format, value)
  }

  getData(format: string): string {
    return this.data.get(format) ?? ''
  }
}

function renderWidget() {
  render(<TimelineBuilderWidget instanceId="test" mode="grid" />)
}

describe('TimelineBuilderWidget', () => {
  it('starts with one empty timeline and a prompt', () => {
    renderWidget()
    expect(screen.getByLabelText(/name of timeline 1/i)).toHaveValue('Timeline 1')
    expect(screen.getByText(/paste timestamps above/i)).toBeInTheDocument()
  })

  it('adds a pasted timestamp with its label', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy started')

    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('deploy started')
    expect(screen.getByText(/1 event over/i)).toBeInTheDocument()
  })

  it('adds one event per pasted line and shows the gap between them', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z start{Enter}2024-01-15T12:35:56Z end')

    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('start')
    expect(screen.getByLabelText(/label for event at 12:35:56/i)).toHaveValue('end')
    expect(screen.getByText('+1m 00s')).toBeInTheDocument()
    expect(screen.getByText(/2 events over/i)).toBeInTheDocument()
  })

  it('orders events by instant, not by the order they were pasted', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:35:56Z later{Enter}2024-01-15T12:34:56Z earlier')

    const labels = screen.getAllByPlaceholderText('label').map((field) => (field as HTMLInputElement).value)
    expect(labels).toEqual(['earlier', 'later'])
  })

  it('accepts epoch numbers and other formats in one paste', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '1705322096 epoch seconds{Enter}1705322096789 | epoch millis')

    expect(screen.getByLabelText(/label for event at 12:34:56\.000/i)).toHaveValue('epoch seconds')
    expect(screen.getByLabelText(/label for event at 12:34:56\.789/i)).toHaveValue('epoch millis')
  })

  it('reads offset-less input in the chosen input zone', async () => {
    const user = userEvent.setup()
    renderWidget()
    await user.selectOptions(screen.getByLabelText(/display time zone/i), 'UTC')
    await user.selectOptions(screen.getByLabelText(/input time zone/i), 'Europe/Paris')
    await addLines(user, '2024-01-15 13:34:56 paris log line')

    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('paris log line')
  })

  it('restates every event in the display zone when it changes', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy')
    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/display time zone/i), 'Asia/Tokyo')

    expect(screen.getByLabelText(/label for event at 21:34:56/i)).toHaveValue('deploy')
  })

  it('keeps a line it cannot read in the box and says so', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z ok{Enter}nothing here')

    expect(screen.getByText(/no timestamp found in/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/timestamps to add/i)).toHaveValue('nothing here')
    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('ok')
  })

  it('creates a second timeline and sends new events to it', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await user.click(screen.getByRole('button', { name: /timeline$/i }))

    expect(screen.getByLabelText(/name of timeline 2/i)).toHaveValue('Timeline 2')
    await addLines(user, '2024-01-15T12:34:56Z on the second lane')

    expect(screen.getByLabelText(/timeline for event at 12:34:56/i)).toHaveValue(
      (screen.getByLabelText(/timeline new events go to/i) as HTMLSelectElement).value,
    )
  })

  it('moves an event to another timeline', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy')
    await user.click(screen.getByRole('button', { name: /timeline$/i }))

    const laneSelect = screen.getByLabelText(/timeline for event at 12:34:56/i)
    const secondLaneOption = within(laneSelect).getByRole('option', { name: 'Timeline 2' }) as HTMLOptionElement
    await user.selectOptions(laneSelect, secondLaneOption.value)

    expect(laneSelect).toHaveValue(secondLaneOption.value)
    // The marker now lives on the second lane's track.
    expect(screen.getByRole('button', { name: /deploy at 12:34:56\.000 on Timeline 2/i })).toBeInTheDocument()
  })

  it('drops an event onto another timeline', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy')
    await user.click(screen.getByRole('button', { name: /timeline$/i }))

    const marker = screen.getByRole('button', { name: /deploy at 12:34:56\.000 on Timeline 1/i })
    const secondLane = screen.getByRole('group', { name: 'Timeline 2' })
    const dataTransfer = new FakeDataTransfer()

    fireEvent.dragStart(marker, { dataTransfer })
    fireEvent.dragOver(secondLane, { dataTransfer })
    fireEvent.drop(secondLane, { dataTransfer })

    expect(screen.getByRole('button', { name: /deploy at 12:34:56\.000 on Timeline 2/i })).toBeInTheDocument()
  })

  it('parses log text dropped straight onto a timeline into that timeline', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await user.click(screen.getByRole('button', { name: /timeline$/i }))

    const secondLane = screen.getByRole('group', { name: 'Timeline 2' })
    const dataTransfer = new FakeDataTransfer()
    dataTransfer.setData('text/plain', '2024-01-15T12:34:56Z dropped from the log')

    fireEvent.dragOver(secondLane, { dataTransfer })
    fireEvent.drop(secondLane, { dataTransfer })

    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('dropped from the log')
    expect(
      screen.getByRole('button', { name: /dropped from the log at 12:34:56\.000 on Timeline 2/i }),
    ).toBeInTheDocument()
  })

  it('lights up the marker for the row under the pointer', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy started')

    const marker = screen.getByRole('button', { name: /deploy started at 12:34:56\.000 on Timeline 1/i })
    expect(within(marker).queryByText(/deploy started/)).not.toBeInTheDocument()

    await user.hover(screen.getByLabelText(/label for event at 12:34:56/i))

    expect(within(marker).getByText(/12:34:56\.000 deploy started/)).toBeInTheDocument()
  })

  it('shows how a selected event was read and what line it came from', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, 'Jan 15 12:35:01 healthcheck ok')

    await user.click(screen.getByRole('button', { name: /show details for event at 12:35:01/i }))

    expect(screen.getByText(/Syslog, read as UTC/)).toBeInTheDocument()
    expect(screen.getByText(/Jan 15 12:35:01 healthcheck ok/)).toBeInTheDocument()
  })

  it('keeps saying which zone an event was read in after the picker moves on', async () => {
    const user = userEvent.setup()
    renderWidget()
    await user.selectOptions(screen.getByLabelText(/display time zone/i), 'UTC')
    await user.selectOptions(screen.getByLabelText(/input time zone/i), 'Europe/Paris')
    await addLines(user, '2024-01-15 13:34:56 paris log line')

    // A second batch from another server changes the picker, which must not
    // rewrite what the first batch says about itself.
    await user.selectOptions(screen.getByLabelText(/input time zone/i), 'UTC')
    await user.click(screen.getByRole('button', { name: /show details for event at 12:34:56/i }))

    expect(screen.getByText(/read as Europe\/Paris/)).toBeInTheDocument()
  })

  it('names the empty state of a timeline that has no events', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument()

    await addLines(user, '2024-01-15T12:34:56Z deploy')
    await user.click(screen.getByRole('button', { name: /timeline$/i }))

    expect(screen.getByText(/drag events here/i)).toBeInTheDocument()
  })

  it('keeps the events of a removed timeline on the remaining one', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await user.click(screen.getByRole('button', { name: /timeline$/i }))
    await addLines(user, '2024-01-15T12:34:56Z deploy')

    await user.click(screen.getByRole('button', { name: /remove timeline 2/i }))

    expect(screen.queryByLabelText(/name of timeline 2/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('deploy')
  })

  it('will not remove the last remaining timeline', () => {
    renderWidget()
    expect(screen.getByRole('button', { name: /remove timeline 1/i })).toBeDisabled()
  })

  it('renames an event and a timeline', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy')

    await user.clear(screen.getByLabelText(/label for event at 12:34:56/i))
    await user.type(screen.getByLabelText(/label for event at 12:34:56/i), 'rollback')
    await user.clear(screen.getByLabelText(/name of timeline 1/i))
    await user.type(screen.getByLabelText(/name of timeline 1/i), 'API')

    expect(screen.getByLabelText(/label for event at 12:34:56/i)).toHaveValue('rollback')
    expect(screen.getByLabelText(/name of timeline 1/i)).toHaveValue('API')
  })

  it('removes a single event', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z deploy')

    await user.click(screen.getByRole('button', { name: /remove event at 12:34:56/i }))

    expect(screen.queryByPlaceholderText('label')).not.toBeInTheDocument()
    expect(screen.getByText(/paste timestamps above/i)).toBeInTheDocument()
  })

  it('clears every event at once', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await addLines(user, '2024-01-15T12:34:56Z one{Enter}2024-01-15T12:35:56Z two')

    await user.click(screen.getByRole('button', { name: /^clear$/i }))

    expect(screen.queryAllByPlaceholderText('label')).toHaveLength(0)
  })

  it('captures the current instant with the Now button', async () => {
    const user = userEvent.setup()
    renderWidget()
    await showInUtc(user)
    await user.click(screen.getByRole('button', { name: /^now$/i }))

    expect(screen.getByDisplayValue('now')).toBeInTheDocument()
  })

  it('cycles a timeline color', async () => {
    const user = userEvent.setup()
    renderWidget()
    const swatch = screen.getByRole('button', { name: /change color of timeline 1/i })
    const firstColor = swatch.getAttribute('style')

    await user.click(swatch)

    expect(screen.getByRole('button', { name: /change color of timeline 1/i }).getAttribute('style')).not.toBe(
      firstColor,
    )
  })
})

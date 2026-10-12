import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoListWidget from './TodoListWidget'

function draftField() {
  return screen.getByRole('textbox', { name: /new to-do item/i })
}

describe('TodoListWidget', () => {
  it('shows a placeholder when the list is empty', () => {
    render(<TodoListWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/nothing on the list yet/i)).toBeInTheDocument()
  })

  it('adds an item via the Add button and clears the draft', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk')
    await user.click(screen.getByRole('button', { name: /add item/i }))

    expect(screen.getByDisplayValue('Buy milk')).toBeInTheDocument()
    expect(draftField()).toHaveValue('')
  })

  it('adds an item by pressing Enter', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Walk the dog{Enter}')

    expect(screen.getByDisplayValue('Walk the dog')).toBeInTheDocument()
  })

  it('does not add a blank item', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), '   {Enter}')

    expect(screen.getByText(/nothing on the list yet/i)).toBeInTheDocument()
  })

  it('toggles an item done, applying strikethrough and updating the remaining count', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.type(draftField(), 'Walk the dog{Enter}')
    expect(screen.getByText('2 of 2 remaining')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))

    expect(screen.getByText('1 of 2 remaining')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Buy milk')).toHaveClass('line-through')
  })

  it('edits an item in place', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    const itemField = screen.getByDisplayValue('Buy milk')
    await user.clear(itemField)
    await user.type(itemField, 'Buy oat milk')

    expect(screen.getByDisplayValue('Buy oat milk')).toBeInTheDocument()
  })

  it('removes an item', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.click(screen.getByRole('button', { name: /remove "buy milk"/i }))

    expect(screen.getByText(/nothing on the list yet/i)).toBeInTheDocument()
  })

  it('clears only completed items', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.type(draftField(), 'Walk the dog{Enter}')
    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))

    const clearButton = screen.getByRole('button', { name: /clear completed/i })
    expect(clearButton).toBeEnabled()
    await user.click(clearButton)

    expect(screen.queryByDisplayValue('Buy milk')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Walk the dog')).toBeInTheDocument()
  })

  it('disables "Clear completed" when nothing is done', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')

    expect(screen.getByRole('button', { name: /clear completed/i })).toBeDisabled()
  })

  it('keeps its items across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    unmount()

    render(<TodoListWidget instanceId="test" mode="grid" />)
    expect(screen.getByDisplayValue('Buy milk')).toBeInTheDocument()
  })
})

describe('TodoListWidget ticket and MR link', () => {
  it('does not show the ticket/MR editor row until the tag button is clicked', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')

    expect(screen.queryByRole('textbox', { name: /ticket number for/i })).not.toBeInTheDocument()
  })

  it('opens the ticket/MR editor and sets a ticket, showing it as a badge', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.click(screen.getByRole('button', { name: /edit ticket and mr link for "buy milk"/i }))
    await user.type(screen.getByRole('textbox', { name: /ticket number for/i }), 'PROJ-123')

    expect(screen.getByText('PROJ-123')).toBeInTheDocument()
  })

  it('sets a valid MR URL, rendering it as a hyperlink labeled "MR"', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.click(screen.getByRole('button', { name: /edit ticket and mr link for "buy milk"/i }))
    await user.type(
      screen.getByRole('textbox', { name: /merge request link for/i }),
      'https://gitlab.com/org/repo/-/merge_requests/42',
    )

    const link = screen.getByRole('link', { name: /open merge request/i })
    expect(link).toHaveTextContent('MR')
    expect(link).toHaveAttribute('href', 'https://gitlab.com/org/repo/-/merge_requests/42')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows an unclickable "MR" badge for text that is not a valid http(s) URL yet', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.click(screen.getByRole('button', { name: /edit ticket and mr link for "buy milk"/i }))
    await user.type(screen.getByRole('textbox', { name: /merge request link for/i }), 'not a url yet')

    expect(screen.queryByRole('link', { name: /open merge request/i })).not.toBeInTheDocument()
    expect(screen.getByText('MR')).toBeInTheDocument()
  })

  it('leaves ticket and MR entirely optional, with no badges by default', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')

    expect(screen.queryByText('MR')).not.toBeInTheDocument()
  })

  it('keeps ticket and MR link across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    await user.click(screen.getByRole('button', { name: /edit ticket and mr link for "buy milk"/i }))
    await user.type(screen.getByRole('textbox', { name: /ticket number for/i }), 'PROJ-123')
    await user.type(
      screen.getByRole('textbox', { name: /merge request link for/i }),
      'https://gitlab.com/org/repo/-/merge_requests/42',
    )
    unmount()

    render(<TodoListWidget instanceId="test" mode="grid" />)
    expect(screen.getByText('PROJ-123')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open merge request/i })).toBeInTheDocument()
  })
})

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

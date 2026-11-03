import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { sanitizeConfig } from '@/widgets/widgetConfig'
import { hasAnyDirtyWidget } from '@/widgets/useWidgetDirty'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
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
    expect(screen.getByText('2 of 2 left')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))

    expect(screen.getByText('1 of 2 left')).toBeInTheDocument()
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

  it('removes an item left blank after editing, rather than saving an empty one', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    const itemField = screen.getByDisplayValue('Buy milk')
    await user.clear(itemField)
    await user.tab() // blur without retyping anything

    expect(screen.getByText(/nothing on the list yet/i)).toBeInTheDocument()
  })

  it('leaves an item alone when blurred with non-blank text', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')
    const itemField = screen.getByDisplayValue('Buy milk')
    await user.click(itemField)
    await user.tab()

    expect(screen.getByDisplayValue('Buy milk')).toBeInTheDocument()
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

    const clearButton = screen.getByRole('button', { name: /clear done/i })
    expect(clearButton).toBeEnabled()
    await user.click(clearButton)

    expect(screen.queryByDisplayValue('Buy milk')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Walk the dog')).toBeInTheDocument()
  })

  it('disables "Clear completed" when nothing is done', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await user.type(draftField(), 'Buy milk{Enter}')

    expect(screen.getByRole('button', { name: /clear done/i })).toBeDisabled()
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

function itemTexts() {
  return screen.getAllByRole('textbox', { name: /^edit "/i }).map((field) => (field as HTMLInputElement).value)
}

async function addItems(user: ReturnType<typeof userEvent.setup>, ...texts: string[]) {
  for (const text of texts) await user.type(draftField(), `${text}{Enter}`)
}

describe('TodoListWidget refs', () => {
  it('shows no chips and no editor by default', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /add a link or ticket/i })).not.toBeInTheDocument()
  })

  it('turns a URL typed in the draft into a labeled chip', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Review https://gitlab.com/org/repo/-/merge_requests/42')

    expect(screen.getByDisplayValue('Review')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open !42 in org/repo' })
    expect(link).toHaveAttribute('href', 'https://gitlab.com/org/repo/-/merge_requests/42')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('names an item made only of a link after that link', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'https://github.com/org/repo/pull/7')

    expect(screen.getByDisplayValue('PR #7')).toBeInTheDocument()
  })

  it('attaches refs pasted into an item instead of inserting them as text', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(screen.getByDisplayValue('Buy milk'))
    await user.paste('PROJ-7 https://example.com/doc')

    expect(screen.getByDisplayValue('Buy milk')).toBeInTheDocument()
    expect(screen.getByText('PROJ-7')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open example.com' })).toBeInTheDocument()
  })

  it('pastes ordinary text as text', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy')
    await user.click(screen.getByDisplayValue('Buy'))
    await user.paste(' oat milk')

    expect(screen.getByDisplayValue('Buy oat milk')).toBeInTheDocument()
  })

  it('adds any text as a tag from the editor, and removes a chip', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(screen.getByRole('button', { name: /edit links for "buy milk"/i }))
    await user.type(screen.getByRole('textbox', { name: /add a link or ticket/i }), 'needs review{Enter}')
    expect(screen.getByText('needs review')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove needs review' }))
    expect(screen.queryByText('needs review')).not.toBeInTheDocument()
  })

  it('renders an unsafe URL as plain text, never as a link', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(screen.getByRole('button', { name: /edit links for "buy milk"/i }))
    await user.type(screen.getByRole('textbox', { name: /add a link or ticket/i }), 'javascript:alert(1){Enter}')

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
  })

  it('closes the editor on Escape and returns focus to its toggle', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    const toggle = screen.getByRole('button', { name: /edit links for "buy milk"/i })
    await user.click(toggle)
    expect(screen.getByRole('textbox', { name: /add a link or ticket/i })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('textbox', { name: /add a link or ticket/i })).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })

  it('renders the first two refs inline and counts the rest for narrow and wide rows', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Ship https://a.example.com https://b.example.com https://c.example.com')

    // jsdom applies no container queries, so both counts are in the DOM:
    // "+2" next to one chip on a narrow row, "+1" next to two on a wide one.
    expect(screen.getAllByRole('link')).toHaveLength(2)
    const count = screen.getByRole('button', { name: 'Show all 3 links' })
    expect(within(count).getByText('2')).toBeInTheDocument()
    expect(within(count).getByText('1')).toBeInTheDocument()
  })

  it('opens the editor with every ref from the "+N" count', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Ship https://a.example.com https://b.example.com https://c.example.com')
    await user.click(screen.getByRole('button', { name: 'Show all 3 links' }))

    expect(screen.getByRole('textbox', { name: /add a link or ticket/i })).toHaveFocus()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /^remove [abc]\.example\.com$/i })).toHaveLength(3)
  })

  it('keeps refs across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Review https://github.com/org/repo/pull/7')
    unmount()

    render(<TodoListWidget instanceId="test" mode="grid" />)
    expect(screen.getByRole('link', { name: 'Open PR #7 in org/repo' })).toBeInTheDocument()
  })
})

describe('TodoListWidget reorder', () => {
  it('moves the focused item with Alt+Arrow and keeps it focused', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'a', 'b', 'c')
    await user.click(screen.getByDisplayValue('a'))
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    expect(itemTexts()).toEqual(['b', 'a', 'c'])
    expect(screen.getByDisplayValue('a')).toHaveFocus()

    await user.keyboard('{Alt>}{ArrowUp}{ArrowUp}{/Alt}')
    expect(itemTexts()).toEqual(['a', 'b', 'c'])
  })

  it('moves an item dropped onto another', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'a', 'b', 'c')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' }
    const handles = screen.getAllByTitle(/drag to reorder/i)
    const firstRow = screen.getByDisplayValue('a').closest('li')!

    fireEvent.dragStart(handles[2], { dataTransfer })
    fireEvent.dragOver(firstRow, { dataTransfer })
    fireEvent.drop(firstRow, { dataTransfer })

    expect(itemTexts()).toEqual(['c', 'a', 'b'])
  })
})

describe('TodoListWidget filter and progress', () => {
  it('filters open and done items, with a filter-aware empty state', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk', 'Walk the dog')
    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))

    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(itemTexts()).toEqual(['Walk the dog'])

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(itemTexts()).toEqual(['Buy milk'])

    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as not done/i }))
    expect(screen.getByText('No done items')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(itemTexts()).toEqual(['Buy milk', 'Walk the dog'])
  })

  it('switches from Done back to All when an item is added', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await addItems(user, 'Walk the dog')

    expect(itemTexts()).toEqual(['Buy milk', 'Walk the dog'])
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a new item after clearing every done item from the Done view', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: /clear done/i }))
    await addItems(user, 'Walk the dog')

    expect(itemTexts()).toEqual(['Walk the dog'])
  })

  it('keeps the Open filter when an item is added', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await addItems(user, 'Walk the dog')

    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true')
    expect(itemTexts()).toEqual(['Buy milk', 'Walk the dog'])
  })

  it('shows progress as the done count', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="grid" />)

    await addItems(user, 'Buy milk', 'Walk the dog')
    const progress = screen.getByRole('progressbar', { name: /completed items/i })
    expect(progress).toHaveAttribute('aria-valuenow', '0')

    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '2')
  })
})

describe('TodoListWidget remember tasks', () => {
  function pin() {
    useDashboardStore.setState({
      dashboards: [
        { id: 'd', name: 'D', widgets: [{ instanceId: 'pinned', widgetId: 'todo-list', x: 0, y: 0, w: 3, h: 4 }] },
      ],
      activeDashboardId: 'd',
    })
  }
  const savedConfig = () => useDashboardStore.getState().dashboards[0].widgets[0].config

  function rememberBox() {
    return screen.getByRole('checkbox', { name: /remember tasks/i })
  }

  it('is off by default and shown even on an empty list', () => {
    pin()
    render(<TodoListWidget instanceId="pinned" mode="grid" />)

    expect(rememberBox()).not.toBeChecked()
    expect(savedConfig()).toBeUndefined()
  })

  it('moves the list into configuration, keeping it through Clear state and a remount', async () => {
    const user = userEvent.setup()
    pin()
    const { unmount } = render(<TodoListWidget instanceId="pinned" mode="grid" />)

    await addItems(user, 'Buy milk')
    await user.click(rememberBox())
    await addItems(user, 'Review https://github.com/org/repo/pull/7')

    expect(savedConfig()?.remember).toBe(true)
    expect((savedConfig()?.savedItems as { text: string }[]).map((item) => item.text)).toEqual(['Buy milk', 'Review'])
    // Remembered items are saved, so they are not unsaved content.
    expect(hasAnyDirtyWidget()).toBe(false)

    unmount()
    useWidgetStateStore.getState().resetInstances(['pinned'])
    render(<TodoListWidget instanceId="pinned" mode="grid" />)

    expect(itemTexts()).toEqual(['Buy milk', 'Review'])
    expect(screen.getByRole('link', { name: 'Open PR #7 in org/repo' })).toBeInTheDocument()
    expect(rememberBox()).toBeChecked()
  })

  it('saves edits made while remembered', async () => {
    const user = userEvent.setup()
    pin()
    render(<TodoListWidget instanceId="pinned" mode="grid" />)

    await user.click(rememberBox())
    await addItems(user, 'Buy milk')
    await user.click(screen.getByRole('checkbox', { name: /mark "buy milk" as done/i }))

    expect(savedConfig()?.savedItems).toEqual([expect.objectContaining({ text: 'Buy milk', done: true })])
  })

  it('drops the configuration when turned off but keeps the list on screen', async () => {
    const user = userEvent.setup()
    pin()
    render(<TodoListWidget instanceId="pinned" mode="grid" />)

    await user.click(rememberBox())
    await addItems(user, 'Buy milk')
    await user.click(rememberBox())

    expect(savedConfig()).toBeUndefined()
    expect(itemTexts()).toEqual(['Buy milk'])
    expect(rememberBox()).not.toBeChecked()
    expect(hasAnyDirtyWidget()).toBe(true)
  })

  it('remembers on an unpinned overlay instance until it is closed', async () => {
    const user = userEvent.setup()
    render(<TodoListWidget instanceId="test" mode="overlay" />)

    await addItems(user, 'Buy milk')
    await user.click(rememberBox())

    expect(rememberBox()).toBeChecked()
    expect(itemTexts()).toEqual(['Buy milk'])
  })

  it('keeps only valid saved items from a share link', () => {
    const item = { id: 'a', text: 'Buy milk', done: false, refs: ['PROJ-1'] }
    expect(sanitizeConfig('todo-list', { remember: true, savedItems: [item] })).toEqual({
      remember: true,
      savedItems: [item],
    })
    expect(sanitizeConfig('todo-list', { remember: 'yes', savedItems: [{ id: 1 }] })).toBeUndefined()
  })
})

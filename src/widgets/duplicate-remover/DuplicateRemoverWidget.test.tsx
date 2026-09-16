import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DuplicateRemoverWidget from './DuplicateRemoverWidget'

function list(...items: string[]): string {
  return items.join('\n')
}

function inputBox() {
  return screen.getByPlaceholderText(/paste a list/i)
}

function outputBox() {
  return screen.getByPlaceholderText('Unique items')
}

describe('DuplicateRemoverWidget', () => {
  it('starts empty, with nothing to report', () => {
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/nothing to deduplicate yet/i)).toBeInTheDocument()
    expect(outputBox()).toHaveValue('')
  })

  it('removes duplicates and reports the totals', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('red', 'green', 'red', 'blue', 'green', 'red'))

    expect(outputBox()).toHaveValue(list('red', 'green', 'blue'))
    const stats = screen.getByText(/items ·/).textContent
    expect(stats).toContain('6')
    expect(stats).toContain('3 unique')
    expect(stats).toContain('3 removed')
  })

  it('lists each repeated item with how many times it occurred', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('red', 'green', 'red', 'blue', 'green', 'red'))
    await user.click(screen.getByRole('button', { name: /duplicates \(2\)/i }))

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('red')).toBeInTheDocument()
    expect(within(rows[0]).getByText('× 3')).toBeInTheDocument()
    expect(within(rows[1]).getByText('green')).toBeInTheDocument()
    expect(within(rows[1]).getByText('× 2')).toBeInTheDocument()
  })

  it('says so when a list is already a set', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('a', 'b', 'c'))
    await user.click(screen.getByRole('button', { name: /^duplicates$/i }))

    expect(screen.getByText(/every item is already unique/i)).toBeInTheDocument()
  })

  it('caps the duplicate list but keeps the total exact', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    const items = Array.from({ length: 250 }, (_, index) => `item-${index}`)
    await user.click(inputBox())
    await user.paste(list(...items, ...items))
    await user.click(screen.getByRole('button', { name: /duplicates \(250\)/i }))

    expect(screen.getAllByRole('listitem')).toHaveLength(200)
    expect(screen.getByText(/showing the 200 most repeated of 250 duplicated values/i)).toBeInTheDocument()
  })

  it('folds case only when asked', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('Apple', 'apple', 'APPLE'))
    expect(outputBox()).toHaveValue(list('Apple', 'apple', 'APPLE'))

    await user.click(screen.getByRole('button', { name: /ignore case/i }))
    expect(outputBox()).toHaveValue('Apple')
  })

  it('splits on commas when the comma mode is picked', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste('a, b, a, c')
    expect(outputBox()).toHaveValue('a, b, a, c')

    await user.click(screen.getByRole('button', { name: 'Commas' }))
    expect(outputBox()).toHaveValue('a, b, c')
  })

  it('reorders the output without changing what it contains', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('pear', 'apple', 'pear', 'fig'))

    await user.click(screen.getByRole('button', { name: 'A→Z' }))
    expect(outputBox()).toHaveValue(list('apple', 'fig', 'pear'))

    await user.click(screen.getByRole('button', { name: 'Count' }))
    expect(outputBox()).toHaveValue(list('pear', 'apple', 'fig'))
  })

  it('feeds the deduplicated list back in as the new input', async () => {
    const user = userEvent.setup()
    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('a', 'b', 'a'))
    await user.click(screen.getByRole('button', { name: /use as input/i }))

    expect(inputBox()).toHaveValue(list('a', 'b'))
    expect(screen.queryByRole('button', { name: /use as input/i })).not.toBeInTheDocument()
  })

  it('keeps its options and content across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)

    await user.click(inputBox())
    await user.paste(list('a', 'A'))
    await user.click(screen.getByRole('button', { name: /ignore case/i }))
    unmount()

    render(<DuplicateRemoverWidget instanceId="test" mode="grid" />)
    expect(screen.getByRole('button', { name: /ignore case/i })).toHaveAttribute('aria-pressed', 'true')
    expect(outputBox()).toHaveValue('a')
  })
})

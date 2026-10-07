import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SemverWidget from './SemverWidget'

function versionField() {
  return screen.getByLabelText<HTMLInputElement>('Version')
}

function rangeField() {
  return screen.getByLabelText<HTMLInputElement>('Range')
}

async function setField(field: HTMLInputElement, value: string) {
  const user = userEvent.setup()
  await user.clear(field)
  if (value) await user.type(field, value)
  return user
}

describe('SemverWidget', () => {
  it('starts with a valid pre-release version that matches the default range', () => {
    render(<SemverWidget instanceId="test" mode="grid" />)

    expect(screen.getByText('Valid SemVer 2.0.0')).toBeInTheDocument()
    const parts = screen.getByLabelText('Version parts')
    expect(within(parts).getByText('rc')).toBeInTheDocument()
    expect(within(parts).getByText('5114f85')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Version satisfies the range')
  })

  it('breaks a version into labelled parts', async () => {
    render(<SemverWidget instanceId="test" mode="grid" />)
    await setField(versionField(), '10.20.30')

    const parts = screen.getByLabelText('Version parts')
    expect(within(parts).getByText('Major').previousSibling).toHaveTextContent('10')
    expect(within(parts).getByText('Minor').previousSibling).toHaveTextContent('20')
    expect(within(parts).getByText('Patch').previousSibling).toHaveTextContent('30')
    expect(within(parts).queryByText('Pre-release')).not.toBeInTheDocument()
  })

  it('lists spec violations and applies the suggested fix', async () => {
    render(<SemverWidget instanceId="test" mode="grid" />)
    const user = await setField(versionField(), 'v1.2')

    expect(screen.getByText('Not SemVer 2.0.0 compliant')).toBeInTheDocument()
    const issues = screen.getByRole('list', { name: 'Spec violations' })
    expect(within(issues).getAllByRole('listitem')).toHaveLength(2)
    expect(versionField()).toHaveAttribute('aria-invalid', 'true')
    expect(versionField()).toHaveAccessibleDescription(/"v" prefix/)

    await user.click(screen.getByRole('button', { name: 'Use it' }))
    expect(versionField()).toHaveValue('1.2.0')
    expect(screen.getByText('Valid SemVer 2.0.0')).toBeInTheDocument()
  })

  it('bumps to the next release with one click', async () => {
    render(<SemverWidget instanceId="test" mode="grid" />)
    const user = await setField(versionField(), '1.2.3')

    await user.click(screen.getByRole('button', { name: /Minor 1\.3\.0/ }))
    expect(versionField()).toHaveValue('1.3.0')
  })

  it('shows how the range desugars and whether it matches', async () => {
    render(<SemverWidget instanceId="test" mode="grid" />)
    await setField(versionField(), '2.5.0')
    await setField(rangeField(), '^1.2.0 || ~2.5')

    expect(screen.getByRole('status')).toHaveTextContent('Version satisfies the range')
    const breakdown = screen.getByRole('list', { name: 'Range breakdown' })
    const [caret, tilde] = within(breakdown).getAllByRole('listitem')
    expect(caret).toHaveTextContent('^1.2.0 means >=1.2.0 <2.0.0-0')
    expect(within(caret).getByLabelText('no match')).toBeInTheDocument()
    expect(within(tilde).getByLabelText('matches')).toBeInTheDocument()
  })

  it('explains the pre-release rule and lets the user relax it', async () => {
    render(<SemverWidget instanceId="test" mode="grid" />)
    await setField(versionField(), '1.5.0-beta')
    const user = await setField(rangeField(), '^1.2.0')

    expect(screen.getByRole('status')).toHaveTextContent('does not satisfy')
    expect(screen.getByText(/Pre-releases only match/)).toBeInTheDocument()

    await user.click(screen.getByLabelText('Include pre-releases'))
    expect(screen.getByRole('status')).toHaveTextContent('Version satisfies the range')
  })

  it('reports an invalid range', async () => {
    render(<SemverWidget instanceId="test" mode="grid" />)
    await setField(rangeField(), '>=1.0.0 nope')

    expect(screen.getByText('"nope" is not a valid comparator')).toBeInTheDocument()
    expect(rangeField()).toHaveAttribute('aria-invalid', 'true')
    expect(rangeField()).toHaveAccessibleDescription('"nope" is not a valid comparator')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

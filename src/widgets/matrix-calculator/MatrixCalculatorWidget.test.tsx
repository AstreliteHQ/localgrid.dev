import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MatrixCalculatorWidget from './MatrixCalculatorWidget'

function cell(label: string, row: number, col: number) {
  return screen.getByLabelText(`${label} row ${row} column ${col}`)
}

async function setCell(user: ReturnType<typeof userEvent.setup>, label: string, row: number, col: number, value: string) {
  const field = cell(label, row, col)
  await user.clear(field)
  if (value !== '') await user.type(field, value)
}

describe('MatrixCalculatorWidget', () => {
  it('opens on the textbook 2×2 multiplication example', () => {
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    expect(screen.getByRole('button', { name: 'A × B' })).toHaveAttribute('aria-pressed', 'true')
    expect(cell('Result', 1, 1)).toHaveValue('19')
    expect(cell('Result', 1, 2)).toHaveValue('22')
    expect(cell('Result', 2, 1)).toHaveValue('43')
    expect(cell('Result', 2, 2)).toHaveValue('50')
  })

  it('recomputes as a cell changes', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await setCell(user, 'Matrix A', 1, 1, '10')

    expect(cell('Result', 1, 1)).toHaveValue('64')
  })

  it('switches to addition and hides matrix B when it is not needed', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'A + B' }))
    expect(cell('Result', 1, 1)).toHaveValue('6')

    await user.click(screen.getByRole('button', { name: 'Aᵀ' }))
    expect(screen.queryByText('Matrix B')).not.toBeInTheDocument()
  })

  it('shows an error and no result for incompatible shapes', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'A + B' }))
    // Grow A to 3 columns so it no longer matches B's 2.
    const colsInputs = screen.getAllByLabelText('Cols')
    await user.clear(colsInputs[0])
    await user.type(colsInputs[0], '3')
    await user.tab()

    expect(screen.getByText(/same size to add/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Result row/)).not.toBeInTheDocument()
  })

  it('computes a determinant as a single scalar, not a grid', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'det(A)' }))

    expect(screen.getByText('-2')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Result row/)).not.toBeInTheDocument()
  })

  it('reports a singular matrix rather than a bogus inverse', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await setCell(user, 'Matrix A', 2, 1, '2')
    await setCell(user, 'Matrix A', 2, 2, '4')
    await user.click(screen.getByRole('button', { name: 'A⁻¹' }))

    expect(screen.getByText(/singular/i)).toBeInTheDocument()
  })

  it('applies a scalar multiply using the k field', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: 'k × A' }))
    const scalarField = screen.getByLabelText('Scalar k')
    await user.clear(scalarField)
    await user.type(scalarField, '3')

    expect(cell('Result', 1, 1)).toHaveValue('3')
    expect(cell('Result', 2, 2)).toHaveValue('12')
  })

  it('resizing rows keeps existing cell values and fills the rest with 0', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    const rowsInputs = screen.getAllByLabelText('Rows')
    await user.clear(rowsInputs[0])
    await user.type(rowsInputs[0], '3')
    await user.tab()

    expect(cell('Matrix A', 1, 1)).toHaveValue('1')
    expect(cell('Matrix A', 3, 1)).toHaveValue('0')
  })

  it('clamps a mid-typed negative row count instead of collapsing the grid', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    const rowsInput = screen.getAllByLabelText('Rows')[0]
    await user.clear(rowsInput)
    await user.type(rowsInput, '-1')

    // Clamped to the minimum as soon as it's typed, not just on blur — the
    // grid still has a real row to edit instead of collapsing to zero.
    expect(cell('Matrix A', 1, 1)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Matrix A row 2/)).not.toBeInTheDocument()
  })

  it('clamps a mid-typed oversized column count to the maximum', async () => {
    const user = userEvent.setup()
    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    const colsInput = screen.getAllByLabelText('Cols')[0]
    await user.clear(colsInput)
    await user.type(colsInput, '99')

    expect(cell('Matrix A', 1, 6)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Matrix A row 1 column 7/)).not.toBeInTheDocument()
  })

  it('keeps its matrices and operation across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)

    await setCell(user, 'Matrix A', 1, 1, '9')
    await user.click(screen.getByRole('button', { name: 'Aᵀ' }))
    unmount()

    render(<MatrixCalculatorWidget instanceId="test" mode="grid" />)
    expect(cell('Matrix A', 1, 1)).toHaveValue('9')
    expect(screen.getByRole('button', { name: 'Aᵀ' })).toHaveAttribute('aria-pressed', 'true')
  })
})

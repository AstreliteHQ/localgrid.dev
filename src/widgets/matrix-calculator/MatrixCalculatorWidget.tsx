import { useMemo } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NumberField } from '@/components/NumberField'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/formatNumber'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { compute, parseGrid, resizeGrid, type Matrix, type Operation } from './matrixMath'

const MIN_SIZE = 1
const MAX_SIZE = 6

const OPERATION_OPTIONS: { label: string; value: Operation }[] = [
  { label: 'A + B', value: 'add' },
  { label: 'A − B', value: 'subtract' },
  { label: 'A × B', value: 'multiply' },
  { label: 'k × A', value: 'scalar' },
  { label: 'Aᵀ', value: 'transpose' },
  { label: 'det(A)', value: 'determinant' },
  { label: 'A⁻¹', value: 'inverse' },
]

const NEEDS_B: ReadonlySet<Operation> = new Set(['add', 'subtract', 'multiply'])

const SAMPLE_A: string[][] = [
  ['1', '2'],
  ['3', '4'],
]
const SAMPLE_B: string[][] = [
  ['5', '6'],
  ['7', '8'],
]
const DEFAULT_OPERATION: Operation = 'multiply'
const DEFAULT_SCALAR = '2'

function sameGrid(a: string[][], b: string[][]): boolean {
  return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((v, j) => v === b[i][j]))
}

/** Formats a result matrix as plain, copyable text — one row per line, cells
 * tab-separated, the same shape most spreadsheets paste in as. */
function formatMatrixText(matrix: Matrix): string {
  return matrix.map((row) => row.map((v) => formatNumber(v)).join('\t')).join('\n')
}

export default function MatrixCalculatorWidget({ instanceId }: WidgetProps) {
  const [operation, setOperation] = useWidgetState<Operation>(instanceId, 'operation', DEFAULT_OPERATION)
  const [rowsA, setRowsA] = useWidgetState(instanceId, 'rowsA', SAMPLE_A.length)
  const [colsA, setColsA] = useWidgetState(instanceId, 'colsA', SAMPLE_A[0].length)
  const [valuesA, setValuesA] = useWidgetState(instanceId, 'valuesA', SAMPLE_A)
  const [rowsB, setRowsB] = useWidgetState(instanceId, 'rowsB', SAMPLE_B.length)
  const [colsB, setColsB] = useWidgetState(instanceId, 'colsB', SAMPLE_B[0].length)
  const [valuesB, setValuesB] = useWidgetState(instanceId, 'valuesB', SAMPLE_B)
  const [scalarInput, setScalarInput] = useWidgetState(instanceId, 'scalarInput', DEFAULT_SCALAR)

  useWidgetDirty(
    instanceId,
    operation !== DEFAULT_OPERATION ||
      !sameGrid(valuesA, SAMPLE_A) ||
      !sameGrid(valuesB, SAMPLE_B) ||
      scalarInput !== DEFAULT_SCALAR,
  )

  const needsB = NEEDS_B.has(operation)

  // NumberField only clamps to [min, max] on blur — its onChange fires for
  // any finite value typed so far, negative included (Array.from silently
  // treats a negative length as 0 rather than throwing, so a stray "-3"
  // mid-edit would otherwise collapse the grid to nothing before the blur
  // clamp ever runs).
  const clampSize = (value: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, value))

  const handleRowsAChange = (rows: number) => {
    const next = clampSize(rows)
    setRowsA(next)
    setValuesA((prev) => resizeGrid(prev, next, colsA))
  }
  const handleColsAChange = (cols: number) => {
    const next = clampSize(cols)
    setColsA(next)
    setValuesA((prev) => resizeGrid(prev, rowsA, next))
  }
  const handleRowsBChange = (rows: number) => {
    const next = clampSize(rows)
    setRowsB(next)
    setValuesB((prev) => resizeGrid(prev, next, colsB))
  }
  const handleColsBChange = (cols: number) => {
    const next = clampSize(cols)
    setColsB(next)
    setValuesB((prev) => resizeGrid(prev, rowsB, next))
  }

  const { result, error } = useMemo(() => {
    const parsedA = parseGrid(valuesA)
    if (parsedA.error || !parsedA.matrix) return { result: null, error: parsedA.error }

    let matrixB: Matrix = []
    if (needsB) {
      const parsedB = parseGrid(valuesB)
      if (parsedB.error || !parsedB.matrix) return { result: null, error: parsedB.error }
      matrixB = parsedB.matrix
    }

    let scalar = 0
    if (operation === 'scalar') {
      const trimmed = scalarInput.trim()
      const parsedScalar = trimmed === '' ? 0 : Number(trimmed)
      if (!Number.isFinite(parsedScalar)) return { result: null, error: 'The scalar k must be a valid number.' }
      scalar = parsedScalar
    }

    return compute(operation, parsedA.matrix, matrixB, scalar)
  }, [operation, valuesA, valuesB, needsB, scalarInput])

  const resultText = result ? (result.kind === 'scalar' ? formatNumber(result.value) : formatMatrixText(result.value)) : ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-xs">
      <SegmentedControl value={operation} onChange={setOperation} options={OPERATION_OPTIONS} className="flex-wrap" />

      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        <MatrixPanel
          label="A"
          rows={rowsA}
          cols={colsA}
          values={valuesA}
          onRowsChange={handleRowsAChange}
          onColsChange={handleColsAChange}
          onCellChange={(row, col, value) =>
            setValuesA((prev) => prev.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)))
          }
        />

        {needsB && (
          <MatrixPanel
            label="B"
            rows={rowsB}
            cols={colsB}
            values={valuesB}
            onRowsChange={handleRowsBChange}
            onColsChange={handleColsBChange}
            onCellChange={(row, col, value) =>
              setValuesB((prev) => prev.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)))
            }
          />
        )}

        {operation === 'scalar' && (
          <Field label="Scalar k" className="max-w-24">
            <Input
              value={scalarInput}
              onChange={(event) => setScalarInput(event.target.value)}
              spellCheck={false}
              inputMode="decimal"
              aria-label="Scalar k"
              className="h-7 font-mono text-[11px]"
            />
          </Field>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Result</p>
        <CopyButton value={resultText} label="" ariaLabel="Copy result" />
      </div>
      <div className="min-h-0 max-h-40 overflow-auto rounded-md bg-background p-2 dark:bg-muted/40">
        {error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : !result ? (
          <p className="text-muted-foreground">Result will appear here</p>
        ) : result.kind === 'scalar' ? (
          <p className="font-mono text-base font-semibold text-foreground">{formatNumber(result.value)}</p>
        ) : (
          <MatrixGrid label="Result" values={result.value.map((row) => row.map((v) => formatNumber(v)))} readOnly />
        )}
      </div>
    </div>
  )
}

function MatrixPanel({
  label,
  rows,
  cols,
  values,
  onRowsChange,
  onColsChange,
  onCellChange,
}: {
  label: string
  rows: number
  cols: number
  values: string[][]
  onRowsChange: (rows: number) => void
  onColsChange: (cols: number) => void
  onCellChange: (row: number, col: number, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-1.5">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Matrix {label}</p>
        <div className="ml-auto flex items-center gap-1.5">
          <NumberField label="Rows" value={rows} min={MIN_SIZE} max={MAX_SIZE} onChange={onRowsChange} />
          <NumberField label="Cols" value={cols} min={MIN_SIZE} max={MAX_SIZE} onChange={onColsChange} />
        </div>
      </div>
      <MatrixGrid label={`Matrix ${label}`} values={values} onCellChange={onCellChange} />
    </div>
  )
}

function MatrixGrid({
  label,
  values,
  readOnly,
  onCellChange,
}: {
  label: string
  values: string[][]
  readOnly?: boolean
  onCellChange?: (row: number, col: number, value: string) => void
}) {
  const cols = values[0]?.length ?? 1
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {values.map((row, i) =>
        row.map((cell, j) => (
          <Input
            key={`${i}-${j}`}
            value={cell}
            readOnly={readOnly}
            onChange={onCellChange ? (event) => onCellChange(i, j, event.target.value) : undefined}
            spellCheck={false}
            inputMode="decimal"
            aria-label={`${label} row ${i + 1} column ${j + 1}`}
            className="h-7 min-w-0 px-1 text-center font-mono text-[11px]"
          />
        )),
      )}
    </div>
  )
}

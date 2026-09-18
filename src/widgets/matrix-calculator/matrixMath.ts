/** Pure matrix arithmetic behind the Matrix Calculator widget — no DOM, no
 * widget state, just numbers in and numbers (or an error) out. */

export type Matrix = number[][]

export interface Dimensions {
  rows: number
  cols: number
}

export function dimensions(m: Matrix): Dimensions {
  return { rows: m.length, cols: m[0]?.length ?? 0 }
}

function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
}

function assertSameShape(a: Matrix, b: Matrix, verb: string): void {
  const da = dimensions(a)
  const db = dimensions(b)
  if (da.rows !== db.rows || da.cols !== db.cols) {
    throw new Error(`Matrices must be the same size to ${verb} (got ${da.rows}×${da.cols} and ${db.rows}×${db.cols}).`)
  }
}

function assertSquare(a: Matrix, opName: string): void {
  const { rows, cols } = dimensions(a)
  if (rows !== cols) throw new Error(`${opName} requires a square matrix (got ${rows}×${cols}).`)
}

export function add(a: Matrix, b: Matrix): Matrix {
  assertSameShape(a, b, 'add')
  return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

export function subtract(a: Matrix, b: Matrix): Matrix {
  assertSameShape(a, b, 'subtract')
  return a.map((row, i) => row.map((v, j) => v - b[i][j]))
}

export function multiplyScalar(a: Matrix, k: number): Matrix {
  return a.map((row) => row.map((v) => v * k))
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const da = dimensions(a)
  const db = dimensions(b)
  if (da.cols !== db.rows) {
    throw new Error(
      `Matrix multiplication needs the first matrix's columns (${da.cols}) to match the second's rows (${db.rows}).`,
    )
  }
  const result = zeros(da.rows, db.cols)
  for (let i = 0; i < da.rows; i++) {
    for (let j = 0; j < db.cols; j++) {
      let sum = 0
      for (let k = 0; k < da.cols; k++) sum += a[i][k] * b[k][j]
      result[i][j] = sum
    }
  }
  return result
}

export function transpose(a: Matrix): Matrix {
  const { rows, cols } = dimensions(a)
  const result = zeros(cols, rows)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) result[j][i] = a[i][j]
  }
  return result
}

/** Partial-pivot Gaussian elimination to an upper-triangular form, tracking
 * the sign flip from each row swap — the determinant is then just the
 * product of the diagonal. Same O(n³) cost as cofactor expansion's O(n!)
 * blowup avoids, and stays numerically stable for the pivot selection. */
export function determinant(a: Matrix): number {
  assertSquare(a, 'Determinant')
  const n = a.length
  const m = a.map((row) => [...row])
  let det = 1
  for (let col = 0; col < n; col++) {
    let pivotRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivotRow][col])) pivotRow = row
    }
    if (Math.abs(m[pivotRow][col]) < 1e-12) return 0
    if (pivotRow !== col) {
      ;[m[col], m[pivotRow]] = [m[pivotRow], m[col]]
      det *= -1
    }
    det *= m[col][col]
    for (let row = col + 1; row < n; row++) {
      const factor = m[row][col] / m[col][col]
      for (let k = col; k < n; k++) m[row][k] -= factor * m[col][k]
    }
  }
  return det
}

/** Gauss-Jordan elimination on `[A | I]` until the left half is the
 * identity, at which point the right half is `A⁻¹`. */
export function inverse(a: Matrix): Matrix {
  assertSquare(a, 'Inverse')
  const n = a.length
  const left = a.map((row) => [...row])
  const right = zeros(n, n)
  for (let i = 0; i < n; i++) right[i][i] = 1

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(left[row][col]) > Math.abs(left[pivotRow][col])) pivotRow = row
    }
    if (Math.abs(left[pivotRow][col]) < 1e-12) {
      throw new Error('Matrix is singular (determinant is 0) and has no inverse.')
    }
    if (pivotRow !== col) {
      ;[left[col], left[pivotRow]] = [left[pivotRow], left[col]]
      ;[right[col], right[pivotRow]] = [right[pivotRow], right[col]]
    }
    const pivot = left[col][col]
    for (let k = 0; k < n; k++) {
      left[col][k] /= pivot
      right[col][k] /= pivot
    }
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = left[row][col]
      for (let k = 0; k < n; k++) {
        left[row][k] -= factor * left[col][k]
        right[row][k] -= factor * right[col][k]
      }
    }
  }
  return right
}

export type Operation = 'add' | 'subtract' | 'multiply' | 'scalar' | 'transpose' | 'determinant' | 'inverse'

export type OperationResult = { kind: 'matrix'; value: Matrix } | { kind: 'scalar'; value: number }

export interface ComputeOutcome {
  result: OperationResult | null
  error: string | null
}

/** Single entry point the widget calls — picks the right operation and
 * turns a thrown validation error into the same `{ result, error }` shape
 * every other widget's compute step already uses. */
export function compute(operation: Operation, a: Matrix, b: Matrix, scalar: number): ComputeOutcome {
  try {
    switch (operation) {
      case 'add':
        return { result: { kind: 'matrix', value: add(a, b) }, error: null }
      case 'subtract':
        return { result: { kind: 'matrix', value: subtract(a, b) }, error: null }
      case 'multiply':
        return { result: { kind: 'matrix', value: multiply(a, b) }, error: null }
      case 'scalar':
        return { result: { kind: 'matrix', value: multiplyScalar(a, scalar) }, error: null }
      case 'transpose':
        return { result: { kind: 'matrix', value: transpose(a) }, error: null }
      case 'determinant':
        return { result: { kind: 'scalar', value: determinant(a) }, error: null }
      case 'inverse':
        return { result: { kind: 'matrix', value: inverse(a) }, error: null }
    }
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : 'Could not compute' }
  }
}

export interface ParsedGrid {
  matrix: Matrix | null
  error: string | null
}

/** Parses a widget-state grid of raw cell text into numbers — a blank cell
 * defaults to 0 (filling in every cell of a fresh, larger matrix by hand
 * would be tedious), but anything non-blank has to be a real number. */
export function parseGrid(grid: string[][]): ParsedGrid {
  const matrix: Matrix = []
  for (let i = 0; i < grid.length; i++) {
    const row: number[] = []
    for (let j = 0; j < grid[i].length; j++) {
      const raw = grid[i][j].trim()
      const value = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(value)) {
        return { matrix: null, error: `Row ${i + 1}, column ${j + 1} isn't a valid number.` }
      }
      row.push(value)
    }
    matrix.push(row)
  }
  return { matrix, error: null }
}

/** Resizes a grid of raw cell text to `rows`×`cols`, keeping whatever
 * overlaps the old and new shape and filling any newly added cells with
 * `fill` — the same "grow/shrink in place" behavior a spreadsheet gives
 * when you drag a selection's border. */
export function resizeGrid(grid: string[][], rows: number, cols: number, fill = '0'): string[][] {
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => grid[i]?.[j] ?? fill))
}

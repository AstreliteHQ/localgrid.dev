import { describe, expect, it } from 'vitest'
import {
  add,
  compute,
  determinant,
  dimensions,
  inverse,
  multiply,
  multiplyScalar,
  parseGrid,
  resizeGrid,
  subtract,
  transpose,
  type Matrix,
} from './matrixMath'

describe('dimensions', () => {
  it('reads rows and columns from a matrix', () => {
    expect(dimensions([[1, 2, 3]])).toEqual({ rows: 1, cols: 3 })
    expect(dimensions([[1], [2], [3]])).toEqual({ rows: 3, cols: 1 })
  })
})

describe('add', () => {
  it('adds element-wise', () => {
    expect(
      add(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ),
    ).toEqual([
      [6, 8],
      [10, 12],
    ])
  })

  it('rejects mismatched shapes', () => {
    expect(() => add([[1, 2]], [[1]])).toThrow(/same size to add/i)
  })
})

describe('subtract', () => {
  it('subtracts element-wise', () => {
    expect(
      subtract(
        [
          [5, 6],
          [7, 8],
        ],
        [
          [1, 2],
          [3, 4],
        ],
      ),
    ).toEqual([
      [4, 4],
      [4, 4],
    ])
  })

  it('rejects mismatched shapes', () => {
    expect(() => subtract([[1, 2]], [[1]])).toThrow(/same size to subtract/i)
  })
})

describe('multiplyScalar', () => {
  it('scales every element', () => {
    expect(
      multiplyScalar(
        [
          [1, -2],
          [3, 4],
        ],
        3,
      ),
    ).toEqual([
      [3, -6],
      [9, 12],
    ])
  })
})

describe('multiply', () => {
  it('computes the standard matrix product, the textbook 2×2 example', () => {
    const a: Matrix = [
      [1, 2],
      [3, 4],
    ]
    const b: Matrix = [
      [5, 6],
      [7, 8],
    ]
    expect(multiply(a, b)).toEqual([
      [19, 22],
      [43, 50],
    ])
  })

  it('handles non-square, compatible shapes', () => {
    const a: Matrix = [
      [1, 2, 3],
      [4, 5, 6],
    ]
    const b: Matrix = [[7], [8], [9]]
    expect(multiply(a, b)).toEqual([[50], [122]])
  })

  it('rejects incompatible shapes', () => {
    expect(() => multiply([[1, 2]], [[1, 2]])).toThrow(/columns \(2\) to match the second's rows \(1\)/i)
  })
})

describe('transpose', () => {
  it('flips rows and columns', () => {
    expect(
      transpose([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    ).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ])
  })
})

describe('determinant', () => {
  it('computes a 2×2 determinant', () => {
    expect(
      determinant([
        [1, 2],
        [3, 4],
      ]),
    ).toBeCloseTo(-2)
  })

  it('computes a 3×3 determinant', () => {
    expect(
      determinant([
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ]),
    ).toBeCloseTo(-306)
  })

  it('is zero for a singular matrix', () => {
    expect(
      determinant([
        [1, 2],
        [2, 4],
      ]),
    ).toBe(0)
  })

  it('rejects a non-square matrix', () => {
    expect(() => determinant([[1, 2, 3]])).toThrow(/square matrix/i)
  })
})

describe('inverse', () => {
  it('inverts a 2×2 matrix', () => {
    const result = inverse([
      [4, 7],
      [2, 6],
    ])
    expect(result[0][0]).toBeCloseTo(0.6)
    expect(result[0][1]).toBeCloseTo(-0.7)
    expect(result[1][0]).toBeCloseTo(-0.2)
    expect(result[1][1]).toBeCloseTo(0.4)
  })

  it('round-trips through multiply back to (approximately) the identity', () => {
    const a: Matrix = [
      [2, 0, 1],
      [1, 3, 2],
      [1, 0, 4],
    ]
    const product = multiply(a, inverse(a))
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(product[i][j]).toBeCloseTo(i === j ? 1 : 0)
      }
    }
  })

  it('rejects a singular matrix', () => {
    expect(() =>
      inverse([
        [1, 2],
        [2, 4],
      ]),
    ).toThrow(/singular/i)
  })

  it('rejects a non-square matrix', () => {
    expect(() => inverse([[1, 2, 3]])).toThrow(/square matrix/i)
  })
})

describe('parseGrid', () => {
  it('parses numeric strings', () => {
    expect(parseGrid([['1', '2'], ['-3.5', '4']])).toEqual({
      matrix: [
        [1, 2],
        [-3.5, 4],
      ],
      error: null,
    })
  })

  it('treats a blank cell as 0', () => {
    expect(parseGrid([['', '2']])).toEqual({ matrix: [[0, 2]], error: null })
  })

  it('reports which cell is invalid', () => {
    const result = parseGrid([
      ['1', '2'],
      ['x', '4'],
    ])
    expect(result.matrix).toBeNull()
    expect(result.error).toMatch(/row 2, column 1/i)
  })
})

describe('resizeGrid', () => {
  it('keeps overlapping cells and fills new ones', () => {
    expect(resizeGrid([['1', '2']], 2, 3)).toEqual([
      ['1', '2', '0'],
      ['0', '0', '0'],
    ])
  })

  it('drops cells outside the new, smaller shape', () => {
    expect(
      resizeGrid(
        [
          ['1', '2'],
          ['3', '4'],
        ],
        1,
        1,
      ),
    ).toEqual([['1']])
  })
})

describe('compute', () => {
  it('dispatches to the right operation for each id', () => {
    const a: Matrix = [
      [1, 2],
      [3, 4],
    ]
    const b: Matrix = [
      [5, 6],
      [7, 8],
    ]
    expect(compute('add', a, b, 0)).toEqual({ result: { kind: 'matrix', value: add(a, b) }, error: null })
    expect(compute('subtract', a, b, 0)).toEqual({ result: { kind: 'matrix', value: subtract(a, b) }, error: null })
    expect(compute('multiply', a, b, 0)).toEqual({ result: { kind: 'matrix', value: multiply(a, b) }, error: null })
    expect(compute('scalar', a, b, 2)).toEqual({ result: { kind: 'matrix', value: multiplyScalar(a, 2) }, error: null })
    expect(compute('transpose', a, b, 0)).toEqual({ result: { kind: 'matrix', value: transpose(a) }, error: null })
    expect(compute('determinant', a, b, 0)).toEqual({ result: { kind: 'scalar', value: -2 }, error: null })
  })

  it('turns a thrown validation error into the result shape', () => {
    const outcome = compute('add', [[1, 2]], [[1]], 0)
    expect(outcome.result).toBeNull()
    expect(outcome.error).toMatch(/same size to add/i)
  })
})

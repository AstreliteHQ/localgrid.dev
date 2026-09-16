import { describe, expect, it } from 'vitest'
import {
  CONSTANT,
  compareGrowth,
  describeGrowth,
  formatGrowth,
  LINEAR,
  LINEARITHMIC,
  LOGARITHMIC,
  maxGrowth,
  multiplyGrowth,
  powerGrowth,
  QUADRATIC,
  solveDecrementRecursion,
  solveDivideAndConquer,
  type Growth,
} from './growth'

const EXPONENTIAL: Growth = { kind: 'exponential', base: 2 }
const FACTORIAL: Growth = { kind: 'factorial' }

describe('formatGrowth', () => {
  it('writes the everyday classes the way they are said out loud', () => {
    expect(formatGrowth(CONSTANT)).toBe('O(1)')
    expect(formatGrowth(LOGARITHMIC)).toBe('O(log n)')
    expect(formatGrowth(LINEAR)).toBe('O(n)')
    expect(formatGrowth(LINEARITHMIC)).toBe('O(n log n)')
    expect(formatGrowth(QUADRATIC)).toBe('O(n²)')
    expect(formatGrowth(EXPONENTIAL)).toBe('O(2^n)')
    expect(formatGrowth(FACTORIAL)).toBe('O(n!)')
  })

  it('uses superscripts past the square, and falls back past nine', () => {
    expect(formatGrowth({ kind: 'poly', degree: 3, logs: 0 })).toBe('O(n³)')
    expect(formatGrowth({ kind: 'poly', degree: 4, logs: 0 })).toBe('O(n⁴)')
    expect(formatGrowth({ kind: 'poly', degree: 12, logs: 0 })).toBe('O(n^12)')
  })

  it('writes a fractional degree instead of swallowing it', () => {
    // What solveDivideAndConquer(3, 4, CONSTANT) produces: a real growth
    // rate between constant and linear, which must not read as O(1).
    expect(formatGrowth({ kind: 'poly', degree: 0.79, logs: 0 })).toBe('O(n^0.79)')
    expect(formatGrowth(solveDivideAndConquer(3, 4, CONSTANT))).toBe('O(n^0.79)')
  })

  it('writes repeated log factors', () => {
    expect(formatGrowth({ kind: 'poly', degree: 1, logs: 2 })).toBe('O(n log² n)')
    expect(formatGrowth({ kind: 'poly', degree: 0, logs: 2 })).toBe('O(log² n)')
  })
})

describe('compareGrowth and maxGrowth', () => {
  it('orders the classes from constant to factorial', () => {
    const ordered = [CONSTANT, LOGARITHMIC, LINEAR, LINEARITHMIC, QUADRATIC, EXPONENTIAL, FACTORIAL]
    for (let index = 1; index < ordered.length; index += 1) {
      expect(compareGrowth(ordered[index - 1], ordered[index])).toBeLessThan(0)
    }
  })

  it('takes the worse of two things running one after the other', () => {
    expect(maxGrowth(LINEAR, QUADRATIC)).toBe(QUADRATIC)
    expect(maxGrowth(EXPONENTIAL, QUADRATIC)).toBe(EXPONENTIAL)
    expect(maxGrowth(LINEAR, LINEAR)).toBe(LINEAR)
  })

  it('separates two exponentials by their base', () => {
    expect(compareGrowth({ kind: 'exponential', base: 2 }, { kind: 'exponential', base: 3 })).toBeLessThan(0)
  })
})

describe('multiplyGrowth and powerGrowth', () => {
  it('adds degrees and log factors when work nests', () => {
    expect(formatGrowth(multiplyGrowth(LINEAR, LINEAR))).toBe('O(n²)')
    expect(formatGrowth(multiplyGrowth(LINEAR, LOGARITHMIC))).toBe('O(n log n)')
    expect(formatGrowth(multiplyGrowth(LINEARITHMIC, LINEARITHMIC))).toBe('O(n² log² n)')
  })

  it('leaves a constant factor alone', () => {
    expect(multiplyGrowth(CONSTANT, QUADRATIC)).toEqual(QUADRATIC)
  })

  it('lets an exponential or factorial absorb polynomial work beside it', () => {
    expect(formatGrowth(multiplyGrowth(LINEAR, EXPONENTIAL))).toBe('O(2^n)')
    expect(formatGrowth(multiplyGrowth(EXPONENTIAL, FACTORIAL))).toBe('O(n!)')
  })

  it('raises a term to a power', () => {
    expect(formatGrowth(powerGrowth(LINEAR, 3))).toBe('O(n³)')
    expect(formatGrowth(powerGrowth(LINEAR, 0))).toBe('O(1)')
  })
})

describe('solveDivideAndConquer', () => {
  it('solves the textbook recurrences', () => {
    // Binary search: one call on half, constant work.
    expect(formatGrowth(solveDivideAndConquer(1, 2, CONSTANT))).toBe('O(log n)')
    // Merge sort: two calls on half, linear merge.
    expect(formatGrowth(solveDivideAndConquer(2, 2, LINEAR))).toBe('O(n log n)')
    // Binary tree walk: two calls on half, constant work.
    expect(formatGrowth(solveDivideAndConquer(2, 2, CONSTANT))).toBe('O(n)')
    // Karatsuba: three calls on half, linear work.
    expect(formatGrowth(solveDivideAndConquer(3, 2, LINEAR))).toBe('O(n^1.58)')
  })

  it('lets dominant work win over the recursion', () => {
    expect(formatGrowth(solveDivideAndConquer(2, 2, QUADRATIC))).toBe('O(n²)')
  })

  it('falls back to the decrement case when the input is not really divided', () => {
    expect(formatGrowth(solveDivideAndConquer(2, 1, CONSTANT))).toBe('O(2^n)')
    expect(formatGrowth(solveDivideAndConquer(1, 1, CONSTANT))).toBe('O(n)')
  })
})

describe('solveDecrementRecursion', () => {
  it('walks linearly with one call per level', () => {
    expect(formatGrowth(solveDecrementRecursion(1, CONSTANT))).toBe('O(n)')
    expect(formatGrowth(solveDecrementRecursion(1, LINEAR))).toBe('O(n²)')
  })

  it('branches exponentially with more than one', () => {
    expect(formatGrowth(solveDecrementRecursion(2, CONSTANT))).toBe('O(2^n)')
    expect(formatGrowth(solveDecrementRecursion(3, LINEAR))).toBe('O(3^n)')
  })
})

describe('describeGrowth', () => {
  it('gives every class a plain-language gloss', () => {
    for (const growth of [CONSTANT, LOGARITHMIC, LINEAR, LINEARITHMIC, QUADRATIC, EXPONENTIAL, FACTORIAL]) {
      expect(describeGrowth(growth).length).toBeGreaterThan(10)
    }
    expect(describeGrowth(QUADRATIC)).toContain('quadruples')
  })

  it('names the base of an exponential rather than always saying it doubles', () => {
    expect(describeGrowth({ kind: 'exponential', base: 2 })).toContain('multiplies the work by 2')
    expect(describeGrowth({ kind: 'exponential', base: 3 })).toContain('multiplies the work by 3')
  })
})

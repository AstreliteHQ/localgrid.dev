/** The algebra of growth rates behind the Big-O Estimator.
 *
 * Everything the estimator computes is a growth term in one variable, `n`,
 * taken to be the size of whatever the code iterates over. Keeping that
 * term structured (a polynomial degree plus a count of log factors) rather
 * than a string is what lets the analyzer combine pieces mechanically:
 * nesting two loops multiplies their terms, running two blocks one after
 * the other takes the larger of the two. */

export type Growth =
  { kind: 'poly'; degree: number; logs: number } | { kind: 'exponential'; base: number } | { kind: 'factorial' }

export const CONSTANT: Growth = { kind: 'poly', degree: 0, logs: 0 }
export const LOGARITHMIC: Growth = { kind: 'poly', degree: 0, logs: 1 }
export const LINEAR: Growth = { kind: 'poly', degree: 1, logs: 0 }
export const LINEARITHMIC: Growth = { kind: 'poly', degree: 1, logs: 1 }
export const QUADRATIC: Growth = { kind: 'poly', degree: 2, logs: 0 }

const SUPERSCRIPTS: Record<string, string> = {
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

/** Superscript digits read well for the exponents that actually turn up
 * (n², n³, and the log powers). Anything else, including the fractional
 * exponent a master-theorem solve can produce (n^1.58), is written with a
 * caret rather than pieced together character by character. */
function superscript(value: number): string {
  const digits = String(value)
  return SUPERSCRIPTS[digits] ?? `^${digits}`
}

/** Orders growth rates: factorial beats every exponential, an exponential
 * beats every polynomial, and two polynomials compare on degree first,
 * then on how many log factors they carry. Returns a negative number when
 * `a` grows more slowly than `b`, as a comparator does. */
export function compareGrowth(a: Growth, b: Growth): number {
  const rank = (growth: Growth) => (growth.kind === 'poly' ? 0 : growth.kind === 'exponential' ? 1 : 2)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  if (a.kind === 'exponential' && b.kind === 'exponential') return a.base - b.base
  if (a.kind !== 'poly' || b.kind !== 'poly') return 0
  if (a.degree !== b.degree) return a.degree - b.degree
  return a.logs - b.logs
}

/** Sequential composition: two things that run one after the other cost
 * the more expensive of the two. */
export function maxGrowth(a: Growth, b: Growth): Growth {
  return compareGrowth(a, b) >= 0 ? a : b
}

/** Nesting: a loop body that costs `b`, run `a` times, costs `a × b`.
 *
 * An exponential or factorial term absorbs whatever polynomial work sits
 * beside it. That is the usual Big-O shorthand rather than the literal
 * truth (n·2^n does outgrow 2^n), and it keeps a verdict like "O(2^n)"
 * from turning into noise like "O(n·2^n)" for a recursion whose real story
 * is that it is exponential. */
export function multiplyGrowth(a: Growth, b: Growth): Growth {
  if (a.kind === 'factorial' || b.kind === 'factorial') return { kind: 'factorial' }
  if (a.kind === 'exponential') return a
  if (b.kind === 'exponential') return b
  return { kind: 'poly', degree: a.degree + b.degree, logs: a.logs + b.logs }
}

/** Raises a growth term to an integer power, used when the same loop shape
 * nests inside itself. */
export function powerGrowth(growth: Growth, exponent: number): Growth {
  let result: Growth = CONSTANT
  for (let index = 0; index < exponent; index += 1) result = multiplyGrowth(result, growth)
  return result
}

/** Renders a growth term the way it would be written on a whiteboard:
 * `O(1)`, `O(log n)`, `O(n log n)`, `O(n²)`, `O(2^n)`. */
export function formatGrowth(growth: Growth): string {
  if (growth.kind === 'factorial') return 'O(n!)'
  if (growth.kind === 'exponential') return `O(${growth.base}^n)`

  const parts: string[] = []
  if (growth.degree === 1) parts.push('n')
  else if (growth.degree > 1) parts.push(`n${superscript(growth.degree)}`)
  if (growth.logs === 1) parts.push('log n')
  else if (growth.logs > 1) parts.push(`log${superscript(growth.logs)} n`)

  return parts.length === 0 ? 'O(1)' : `O(${parts.join(' ')})`
}

/** Plain-language gloss shown next to the notation, so the verdict reads
 * for someone who doesn't think in asymptotics all day. */
export function describeGrowth(growth: Growth): string {
  if (growth.kind === 'factorial')
    return 'Factorial: every added item multiplies the work. Unusable beyond a handful of items.'
  if (growth.kind === 'exponential')
    return 'Exponential: each added item doubles the work. Only viable for very small inputs.'
  if (growth.degree === 0 && growth.logs === 0) return 'Constant: the input size does not change the work.'
  if (growth.degree === 0) return 'Logarithmic: doubling the input adds a fixed amount of work.'
  if (growth.degree === 1 && growth.logs === 0) return 'Linear: work grows in step with the input.'
  if (growth.degree === 1) return 'Linearithmic: the usual cost of a comparison sort.'
  if (growth.degree === 2) return 'Quadratic: doubling the input quadruples the work.'
  if (growth.degree === 3) return 'Cubic: doubling the input multiplies the work by eight.'
  return 'Polynomial: the input size is raised to a fixed power.'
}

/** Solves `T(n) = a·T(n/b) + O(n^work · logⁿ)` for the common cases, i.e.
 * the master theorem restricted to what a snippet can plausibly show.
 * `critical = log_b(a)` is the exponent the recursion alone produces:
 * above the work term it wins outright, below it the work wins, and at a
 * tie the two combine into an extra log factor (mergesort's n log n). */
export function solveDivideAndConquer(calls: number, divisor: number, work: Growth): Growth {
  if (work.kind !== 'poly') return work
  if (divisor <= 1) {
    // Not actually shrinking the input by a factor: treat it as the
    // decrement case instead, which is what `solveDecrementRecursion`
    // handles.
    return calls > 1 ? { kind: 'exponential', base: calls } : multiplyGrowth(LINEAR, work)
  }

  const critical = Math.log(calls) / Math.log(divisor)
  const rounded = Math.round(critical)
  const isInteger = Math.abs(critical - rounded) < 1e-9

  if (critical > work.degree + 1e-9) {
    return { kind: 'poly', degree: isInteger ? rounded : Number(critical.toFixed(2)), logs: 0 }
  }
  if (Math.abs(critical - work.degree) < 1e-9) {
    return { kind: 'poly', degree: work.degree, logs: work.logs + 1 }
  }
  return work
}

/** Solves `T(n) = a·T(n-k) + work`: one call per level is a linear walk
 * down to the base case, more than one branches out exponentially. */
export function solveDecrementRecursion(calls: number, work: Growth): Growth {
  if (calls <= 1) return multiplyGrowth(LINEAR, work)
  return { kind: 'exponential', base: calls }
}

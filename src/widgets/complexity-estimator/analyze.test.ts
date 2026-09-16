import { describe, expect, it } from 'vitest'
import { analyzeComplexity, MAX_SOURCE_LENGTH, type Analysis } from './analyze'
import { formatGrowth } from './growth'

function estimate(source: string): string {
  const result = analyzeComplexity(source)
  if (!result.ok) throw new Error(`analysis failed: ${result.reason}`)
  return formatGrowth(result.growth)
}

function analyzed(source: string): Analysis {
  const result = analyzeComplexity(source)
  if (!result.ok) throw new Error(`analysis failed: ${result.reason}`)
  return result
}

describe('analyzeComplexity, loops', () => {
  it('reads straight-line code as constant', () => {
    expect(estimate('function first(items) { return items[0] + items[1] }')).toBe('O(1)')
  })

  it('reads a single loop as linear', () => {
    expect(
      estimate('function sum(items) { let total = 0; for (const item of items) total += item; return total }'),
    ).toBe('O(n)')
  })

  it('reads nested loops as quadratic, and three levels as cubic', () => {
    expect(
      estimate(`function pairs(items) {
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) { console.log(i, j) }
  }
}`),
    ).toBe('O(n²)')
    expect(
      estimate(`function triples(n) {
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) work()
}`),
    ).toBe('O(n³)')
  })

  it('reads a doubling counter as logarithmic', () => {
    expect(estimate('function jumps(n) { for (let i = 1; i < n; i *= 2) { work() } }')).toBe('O(log n)')
  })

  it('reads a binary search while-loop as logarithmic', () => {
    expect(
      estimate(`function search(items, target) {
  let low = 0
  let high = items.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (items[mid] === target) return mid
    if (items[mid] < target) low = mid + 1
    else high = mid - 1
  }
  return -1
}`),
    ).toBe('O(log n)')
  })

  it('treats a loop with a literal bound as constant', () => {
    expect(estimate('function fixed(items) { for (let i = 0; i < 10; i++) { items[i] = 0 } }')).toBe('O(1)')
  })

  it('multiplies a linear loop by a logarithmic one', () => {
    expect(
      estimate(`function mixed(n) {
  for (let i = 0; i < n; i++) {
    for (let j = 1; j < n; j *= 2) { work() }
  }
}`),
    ).toBe('O(n log n)')
  })
})

describe('analyzeComplexity, library calls', () => {
  it('charges a sort as linearithmic', () => {
    expect(estimate('function ordered(items) { return items.slice().sort((a, b) => a - b) }')).toBe('O(n log n)')
  })

  it('multiplies an iteration method by its callback body', () => {
    expect(estimate('function overlap(a, b) { return a.filter((item) => b.includes(item)) }')).toBe('O(n²)')
  })

  it('keeps a Set lookup inside a loop linear', () => {
    expect(
      estimate(`function overlap(a, b) {
  const seen = new Set(b)
  return a.filter((item) => seen.has(item))
}`),
    ).toBe('O(n)')
  })

  it('counts shift() as the linear operation it is', () => {
    const result = analyzed('function drain(queue) { while (queue.length) { queue.shift() } }')
    expect(formatGrowth(result.growth)).toBe('O(n²)')
    expect(result.findings.some((finding) => finding.message.includes('re-indexes'))).toBe(true)
  })

  it('charges Object.keys and JSON.stringify as linear', () => {
    expect(estimate('function dump(value) { return JSON.stringify(Object.keys(value)) }')).toBe('O(n)')
  })
})

describe('analyzeComplexity, recursion', () => {
  it('reads naive fibonacci as exponential', () => {
    expect(estimate('function fib(n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2) }')).toBe('O(2^n)')
  })

  it('reads a single decrementing call as linear', () => {
    expect(estimate('function countdown(n) { if (n === 0) return 0; return 1 + countdown(n - 1) }')).toBe('O(n)')
  })

  it('reads a halving call as logarithmic', () => {
    expect(estimate('function depth(n) { if (n <= 1) return 0; return 1 + depth(n / 2) }')).toBe('O(log n)')
  })

  it('reads merge sort as linearithmic', () => {
    expect(
      estimate(`function mergeSort(items) {
  if (items.length < 2) return items
  const middle = items.length / 2
  const left = mergeSort(items.slice(0, middle))
  const right = mergeSort(items.slice(middle))
  const out = []
  let a = 0
  let b = 0
  while (a < left.length && b < right.length) {
    out.push(left[a] <= right[b] ? left[a++] : right[b++])
  }
  return out
}`),
    ).toBe('O(n log n)')
  })

  it('catches the shift()-based merge that is quietly quadratic per level', () => {
    // Same divide and conquer, but each merge pops from the front of an
    // array, so the merge step is quadratic and the whole sort is O(n²) —
    // the kind of thing the estimator exists to surface.
    expect(
      estimate(`function mergeSort(items) {
  if (items.length < 2) return items
  const middle = items.length / 2
  const left = mergeSort(items.slice(0, middle))
  const right = mergeSort(items.slice(middle))
  const out = []
  while (left.length && right.length) { out.push(left[0] < right[0] ? left.shift() : right.shift()) }
  return out.concat(left, right)
}`),
    ).toBe('O(n²)')
  })

  it('reads a recursive call inside a loop as factorial', () => {
    expect(
      estimate(`function permute(items, prefix) {
  if (items.length === 0) return [prefix]
  for (let i = 0; i < items.length; i++) {
    permute(items.slice(0, i).concat(items.slice(i + 1)), prefix.concat(items[i]))
  }
}`),
    ).toBe('O(n!)')
  })

  it('flags mutual recursion instead of guessing at it', () => {
    const result = analyzed(`function isEven(n) { if (n === 0) return true; return isOdd(n - 1) }
function isOdd(n) { if (n === 0) return false; return isEven(n - 1) }`)
    expect(result.notes.some((note) => note.includes('Mutual recursion'))).toBe(true)
    expect(result.confidence).toBe('low')
  })
})

describe('analyzeComplexity, reporting', () => {
  it('reports each named function separately', () => {
    const result = analyzed(`function linear(items) { for (const item of items) work(item) }
function quadratic(items) { for (const a of items) for (const b of items) work(a, b) }`)
    expect(result.functions.map((report) => [report.name, formatGrowth(report.growth)])).toEqual([
      ['linear', 'O(n)'],
      ['quadratic', 'O(n²)'],
    ])
    expect(formatGrowth(result.growth)).toBe('O(n²)')
  })

  it('points each finding at the line that caused it', () => {
    const result = analyzed(`function outer(items) {
  for (const a of items) {
    for (const b of items) { work(a, b) }
  }
}`)
    const worst = result.findings[0]
    expect(formatGrowth(worst.growth)).toBe('O(n²)')
    expect(worst.line).toBe(2)
  })

  it('puts the heaviest finding first, whatever kind it is', () => {
    // The exponential recursion is found after the linear loop, and its
    // kind name sorts before "poly" alphabetically: only a real comparison
    // of the growth terms puts it at the top, where the widget's capped
    // list will show it.
    const result = analyzed(`function walk(items) {
  for (const item of items) work(item)
  return walk(items.length - 1) + walk(items.length - 2)
}`)
    expect(formatGrowth(result.findings[0].growth)).toBe('O(2^n)')
    expect(formatGrowth(result.findings[result.findings.length - 1].growth)).toBe('O(n)')
  })

  it('lowers confidence and says so when it cannot see into a call', () => {
    const result = analyzed('function run(items) { for (const item of items) mysteryHelper(item) }')
    expect(result.confidence).toBe('medium')
    expect(result.notes.join(' ')).toContain('mysteryHelper')
  })

  it('names a function defined as a const arrow', () => {
    const result = analyzed('const double = (items) => items.map((item) => item * 2)')
    expect(result.functions[0]?.name).toBe('double')
  })

  it('marks recursive functions as recursive', () => {
    const result = analyzed('function walk(node) { if (!node) return; walk(node.left); walk(node.right) }')
    expect(result.functions[0]?.recursive).toBe(true)
  })
})

describe('analyzeComplexity, input limits', () => {
  it('refuses an empty snippet', () => {
    expect(analyzeComplexity('   \n ')).toEqual({ ok: false, reason: 'Paste a snippet to estimate.' })
  })

  it('refuses a snippet past the size limit, and accepts one at the limit', () => {
    const tooLong = 'const a = 1\n'.repeat(Math.ceil(MAX_SOURCE_LENGTH / 12) + 1)
    expect(tooLong.length).toBeGreaterThan(MAX_SOURCE_LENGTH)
    const refused = analyzeComplexity(tooLong)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toContain('limit is 20,000')

    const atLimit = `const a = 1\n`.repeat(Math.floor(MAX_SOURCE_LENGTH / 12))
    expect(atLimit.length).toBeLessThanOrEqual(MAX_SOURCE_LENGTH)
    expect(analyzeComplexity(atLimit).ok).toBe(true)
  })

  it('still answers for a snippet it cannot fully parse', () => {
    const result = analyzeComplexity('function broken(items) { for (const item of items) { work(item }')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.notes.join(' ')).toContain('could not be parsed')
  })
})

describe('analyzeComplexity, partitioned recursion', () => {
  it('reads a binary tree walk as linear rather than exponential', () => {
    expect(
      estimate(`function walk(node) {
  if (!node) return 0
  return 1 + walk(node.left) + walk(node.right)
}`),
    ).toBe('O(n)')
  })

  it('reads quicksort as its average case, and says that is an assumption', () => {
    const result = analyzed(`function quick(items) {
  if (items.length < 2) return items
  const [pivot, ...rest] = items
  const smaller = rest.filter((item) => item < pivot)
  const larger = rest.filter((item) => item >= pivot)
  return quick(smaller).concat(pivot, quick(larger))
}`)
    expect(formatGrowth(result.growth)).toBe('O(n log n)')
    expect(result.notes.join(' ')).toContain('average case, not the worst')
    expect(result.confidence).toBe('medium')
  })

  it('still reads fibonacci as exponential, since its calls do not split anything', () => {
    expect(estimate('function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }')).toBe('O(2^n)')
  })
})

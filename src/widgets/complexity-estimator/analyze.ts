/** Heuristic Big-O estimator for a JavaScript/TypeScript snippet.
 *
 * Everything runs locally: the snippet is parsed with Lezer's JavaScript
 * grammar (the same parser CodeMirror highlights with) and the resulting
 * tree is walked. Nothing is executed and nothing leaves the browser.
 *
 * What this can and cannot do is worth stating plainly, because the widget
 * repeats it to the user: deciding a program's exact complexity is not
 * computable in general, so this reads the shapes that carry the cost in
 * practice (loop nesting and loop steps, standard-library calls, and the
 * recurrence a recursive function follows) and combines them with the
 * algebra in `growth.ts`. It is a reviewer's first opinion, not a proof.
 */

import { parser } from '@lezer/javascript'
import type { SyntaxNode } from '@lezer/common'
import {
  compareGrowth,
  CONSTANT,
  LINEAR,
  LINEARITHMIC,
  LOGARITHMIC,
  maxGrowth,
  multiplyGrowth,
  solveDecrementRecursion,
  solveDivideAndConquer,
  type Growth,
} from './growth'

/** Upper bound on what the estimator will read. The parse itself is linear
 * and comfortably fast well past this, but the analysis re-walks nested
 * regions and the findings list is rendered row by row, so a bound keeps
 * a runaway paste (a whole bundled file, a minified library) from freezing
 * the tab. It is a snippet tool: this is roughly 600 lines of ordinary
 * code. */
export const MAX_SOURCE_LENGTH = 20_000

export type Confidence = 'high' | 'medium' | 'low'

export interface Finding {
  /** 1-based line in the snippet, for the "why" list. */
  line: number
  /** What this construct contributes on its own. */
  growth: Growth
  message: string
}

export interface FunctionReport {
  name: string
  line: number
  growth: Growth
  recursive: boolean
}

export interface Analysis {
  ok: true
  /** The snippet's overall estimate: the worst of its top-level code and
   * of every function it defines. */
  growth: Growth
  confidence: Confidence
  findings: Finding[]
  functions: FunctionReport[]
  /** Assumptions this particular snippet forced, shown under the verdict. */
  notes: string[]
}

export interface AnalysisFailure {
  ok: false
  reason: string
}

const FUNCTION_NODES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunction', 'MethodDeclaration'])
const LOOP_NODES = new Set(['ForStatement', 'WhileStatement', 'DoStatement'])

/** Cost of a standard-library call, in terms of the size of the thing it
 * works on (which the estimator conflates with `n`, as the widget says).
 * `perElement` marks the iteration methods, whose callback body runs once
 * per element and therefore multiplies. */
const LIBRARY_CALLS: Record<string, { growth: Growth; perElement?: boolean; label?: string }> = {
  // Iteration with a callback.
  map: { growth: LINEAR, perElement: true },
  filter: { growth: LINEAR, perElement: true },
  forEach: { growth: LINEAR, perElement: true },
  reduce: { growth: LINEAR, perElement: true },
  reduceRight: { growth: LINEAR, perElement: true },
  some: { growth: LINEAR, perElement: true },
  every: { growth: LINEAR, perElement: true },
  find: { growth: LINEAR, perElement: true },
  findIndex: { growth: LINEAR, perElement: true },
  findLast: { growth: LINEAR, perElement: true },
  findLastIndex: { growth: LINEAR, perElement: true },
  flatMap: { growth: LINEAR, perElement: true },
  // Comparison sorts.
  sort: { growth: LINEARITHMIC, label: 'sort' },
  toSorted: { growth: LINEARITHMIC, label: 'sort' },
  // Linear scans, copies and conversions.
  includes: { growth: LINEAR },
  indexOf: { growth: LINEAR },
  lastIndexOf: { growth: LINEAR },
  join: { growth: LINEAR },
  concat: { growth: LINEAR },
  slice: { growth: LINEAR },
  splice: { growth: LINEAR },
  reverse: { growth: LINEAR },
  toReversed: { growth: LINEAR },
  fill: { growth: LINEAR },
  flat: { growth: LINEAR },
  split: { growth: LINEAR },
  padStart: { growth: LINEAR },
  padEnd: { growth: LINEAR },
  repeat: { growth: LINEAR },
  // Linear despite looking like O(1): both re-index the whole array.
  shift: { growth: LINEAR, label: 'shift (re-indexes the array)' },
  unshift: { growth: LINEAR, label: 'unshift (re-indexes the array)' },
}

/** Qualified calls whose cost depends on the receiver being a built-in,
 * keyed as `Object.keys`, `JSON.parse`, … */
const QUALIFIED_CALLS: Record<string, Growth> = {
  'Object.keys': LINEAR,
  'Object.values': LINEAR,
  'Object.entries': LINEAR,
  'Object.assign': LINEAR,
  'Object.fromEntries': LINEAR,
  'Array.from': LINEAR,
  'Array.of': LINEAR,
  'JSON.parse': LINEAR,
  'JSON.stringify': LINEAR,
  structuredClone: LINEAR,
}

/** Hash-backed lookups, listed so they are explicitly *not* mistaken for
 * the linear `Array.prototype.includes`/`indexOf` above when the receiver
 * is a Set or Map the snippet built. */
const CONSTANT_TIME_METHODS = new Set([
  'has',
  'get',
  'set',
  'add',
  'delete',
  'push',
  'pop',
  'charAt',
  'charCodeAt',
  'codePointAt',
])

interface FunctionInfo {
  node: SyntaxNode
  name: string
  line: number
  params: string[]
  body: SyntaxNode | null
}

interface Context {
  source: string
  lineAt: (offset: number) => number
  functions: FunctionInfo[]
  /** Function growth, memoized; `null` while one is being resolved, which
   * is how a recursive cycle is spotted. */
  resolved: Map<SyntaxNode, Growth | null>
  findings: Finding[]
  notes: Set<string>
  unknownCalls: Set<string>
  confidence: { value: Confidence }
}

function lowerConfidence(context: Context, to: Confidence): void {
  const order: Confidence[] = ['high', 'medium', 'low']
  if (order.indexOf(to) > order.indexOf(context.confidence.value)) context.confidence.value = to
}

function buildLineIndex(source: string): (offset: number) => number {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return (offset: number) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (starts[mid] <= offset) low = mid
      else high = mid - 1
    }
    return low + 1
  }
}

function text(context: Context, node: SyntaxNode | null): string {
  return node ? context.source.slice(node.from, node.to) : ''
}

function children(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) out.push(child)
  return out
}

/** The name a function is known by: its own binding, the variable it is
 * assigned to, or the property it is defined as. */
function functionName(context: Context, node: SyntaxNode): string {
  const own = node.getChild('VariableDefinition')
  if (own) return text(context, own)
  const property = node.getChild('PropertyDefinition') ?? node.getChild('PropertyName')
  if (property) return text(context, property)
  const parent = node.parent
  if (parent && (parent.name === 'VariableDeclaration' || parent.name === 'Property')) {
    const binding = parent.getChild('VariableDefinition') ?? parent.getChild('PropertyDefinition')
    if (binding) return text(context, binding)
  }
  return '(anonymous)'
}

function functionBody(node: SyntaxNode): SyntaxNode | null {
  // Arrow functions can have an expression body rather than a Block; the
  // expression is the last child either way.
  return node.getChild('Block') ?? node.lastChild
}

function parameterNames(context: Context, node: SyntaxNode): string[] {
  const list = node.getChild('ParamList')
  if (!list) {
    const single = node.getChild('VariableDefinition')
    return single ? [text(context, single)] : []
  }
  return list.getChildren('VariableDefinition').map((param) => text(context, param))
}

function collectFunctions(context: Context, root: SyntaxNode): FunctionInfo[] {
  const found: FunctionInfo[] = []
  const cursor = root.cursor()
  do {
    if (FUNCTION_NODES.has(cursor.name)) {
      const node = cursor.node
      found.push({
        node,
        name: functionName(context, node),
        line: context.lineAt(node.from),
        params: parameterNames(context, node),
        body: functionBody(node),
      })
    }
  } while (cursor.next())
  return found
}

/** True when a `for` loop's condition compares against a literal, i.e. it
 * runs a fixed number of times no matter how big the input is. */
function hasConstantBound(node: SyntaxNode): boolean {
  const spec = node.getChild('ForSpec')
  if (!spec) return false
  const condition = spec.getChildren('BinaryExpression')[0]
  if (!condition) return false
  const right = condition.lastChild
  return right?.name === 'Number'
}

/** Recognizes a step that multiplies or divides the counter (`i *= 2`,
 * `i = Math.floor(i / 2)`, `i >>= 1`), which is what turns a loop
 * logarithmic instead of linear. */
function isHalvingStep(context: Context, node: SyntaxNode | null): boolean {
  if (!node) return false
  const source = text(context, node)
  if (/(\*=|\/=|>>=|<<=|>>>=)/.test(source)) return true
  // `x = x * 2`, `x = x / 2`, `x = Math.floor(x / 2)`, `x = (lo + hi) >> 1`
  return /=[^=]*([*/]|>>|<<)/.test(source) && !/\+\+|--/.test(source)
}

function loopFactor(context: Context, node: SyntaxNode): { growth: Growth; reason: string } {
  if (node.name === 'ForStatement') {
    const spec = node.getChild('ForSpec')
    if (!spec) return { growth: LINEAR, reason: 'iterates over a collection' }
    const step = spec.getChildren('AssignmentExpression')[0] ?? spec.getChildren('PostfixExpression')[0]
    if (isHalvingStep(context, step)) {
      return { growth: LOGARITHMIC, reason: 'counter is multiplied or divided each step' }
    }
    if (hasConstantBound(node)) {
      return { growth: CONSTANT, reason: 'fixed number of iterations' }
    }
    return { growth: LINEAR, reason: 'counter advances by a fixed step' }
  }

  // while / do-while: the only reliable signal in the body is a variable
  // being halved. Anything else is assumed to walk the input once, which
  // is the assumption the widget surfaces as a note.
  const body = node.getChild('Block') ?? node.lastChild
  const halving = body ? children(body).some((child) => containsHalving(context, child)) : false
  if (halving) return { growth: LOGARITHMIC, reason: 'a value is halved each pass' }
  context.notes.add('A `while` loop with no visible halving is assumed to run n times.')
  return { growth: LINEAR, reason: 'assumed to run once per item' }
}

function containsHalving(context: Context, node: SyntaxNode): boolean {
  if (node.name === 'AssignmentExpression' || node.name === 'VariableDeclaration') {
    if (isHalvingStep(context, node)) return true
  }
  return children(node).some((child) => containsHalving(context, child))
}

/** `f(n - 1)` vs `f(n / 2)` vs something the estimator can't read. */
type Reduction =
  | { kind: 'decrement' }
  /** `assumed` marks a split the estimator inferred from the shape of the
   * argument rather than read off an explicit division. */
  | { kind: 'divide'; by: number; assumed?: boolean }
  | { kind: 'unknown' }

interface LocalShapes {
  /** Locals assigned a halved value (`const middle = items.length / 2`,
   * `mid = (lo + hi) >> 1`). */
  halved: Map<string, number>
  /** Locals holding a piece of the input rather than all of it
   * (`const smaller = rest.filter(…)`, `const [first, ...rest] = items`). */
  subsets: Set<string>
}

/** What the locals of a function are made of, which is how a self-call's
 * argument gets read: a call on something halved or on a partition is
 * splitting the input, a call on `n - 1` is shortening it by one, and that
 * difference is mergesort's O(n log n) against fibonacci's O(2^n). */
function readLocalShapes(context: Context, info: FunctionInfo): LocalShapes {
  const shapes: LocalShapes = { halved: new Map(), subsets: new Set() }
  if (!info.body) return shapes

  const visit = (node: SyntaxNode) => {
    if (node.name === 'VariableDeclaration' || node.name === 'AssignmentExpression') {
      const definitions = node.getChildren('VariableDefinition')
      const name = text(context, definitions[0] ?? node.firstChild)
      const value = text(context, node.lastChild)

      const divide = value.match(/\/\s*(\d+)/)
      if (divide) shapes.halved.set(name, Number(divide[1]))
      else if (/>>\s*1\b/.test(value)) shapes.halved.set(name, 2)

      const isSubset = /\.(filter|slice|splice)\s*\(/.test(value) || /\.\.\./.test(text(context, node))
      if (isSubset) {
        for (const definition of definitions.length > 0 ? definitions : []) {
          shapes.subsets.add(text(context, definition))
        }
      }
    }
    for (const child of children(node)) visit(child)
  }
  visit(info.body)
  return shapes
}

function readReduction(
  context: Context,
  call: SyntaxNode,
  params: string[],
  shapes: LocalShapes,
  callCount: number,
): Reduction {
  const args = call.getChild('ArgList')
  if (!args) return { kind: 'unknown' }
  const source = text(context, args)
  const divide = source.match(/\/\s*(\d+)/)
  if (divide) return { kind: 'divide', by: Number(divide[1]) }
  if (/>>\s*1\b/.test(source)) return { kind: 'divide', by: 2 }
  for (const [name, by] of shapes.halved) {
    if (new RegExp(`\\b${name.replace(/[^\w$]/g, '')}\\b`).test(source)) return { kind: 'divide', by }
  }
  // Two or more calls, each handed a *subset* built by partitioning or by
  // following a branch: quicksort's `quick(rest.filter(...))`, a tree walk's
  // `walk(node.left)`. Neither says how big the pieces are, so the even
  // split is assumed, which is the textbook average case and is reported
  // as an assumption rather than as fact.
  const mentionsSubset = [...shapes.subsets].some((name) =>
    new RegExp(`\\b${name.replace(/[^\w$]/g, '')}\\b`).test(source),
  )
  if (
    callCount >= 2 &&
    (mentionsSubset || /\.(filter|slice|splice)\s*\(|\.\.\.|\.(left|right|children|head|tail)\b/.test(source))
  ) {
    return { kind: 'divide', by: 2, assumed: true }
  }
  if (/[-+]\s*\d+/.test(source)) return { kind: 'decrement' }
  // `f(rest)`, `f(node.next)`, `f(arr.slice(1))`: shrinking, but by how
  // much is anybody's guess. Treated as a decrement, and flagged.
  if (params.some((param) => source.includes(param)) || /\bslice\b|\.next\b|\.left\b|\.right\b/.test(source)) {
    return { kind: 'decrement' }
  }
  return { kind: 'unknown' }
}

function calleeName(context: Context, call: SyntaxNode): { plain: string; qualified: string; property: string } {
  const callee = call.firstChild
  if (!callee) return { plain: '', qualified: '', property: '' }
  if (callee.name === 'MemberExpression') {
    const object = text(context, callee.firstChild)
    const property = text(context, callee.lastChild)
    return { plain: property, qualified: `${object}.${property}`, property }
  }
  return { plain: text(context, callee), qualified: text(context, callee), property: '' }
}

/** Cost of one node, whatever it happens to be. Loops and calls are the
 * two shapes that cost something on their own; everything else is worth
 * only what it contains.
 *
 * Statements have to be costed by node and not just by walking a parent's
 * children, because a body is not always a block: `for (…) for (…) work()`
 * hands the outer loop another loop, and a concise arrow hands its call
 * straight back. */
function analyzeStatement(context: Context, node: SyntaxNode | null, scope: FunctionInfo | null): Growth {
  if (!node) return CONSTANT

  // A nested function definition costs nothing where it is written; it is
  // analyzed in its own right, and charged wherever it is called.
  if (FUNCTION_NODES.has(node.name)) return CONSTANT

  if (LOOP_NODES.has(node.name)) {
    const factor = loopFactor(context, node)
    const body = node.getChild('Block') ?? node.lastChild
    const inner = analyzeStatement(context, body, scope)
    const cost = multiplyGrowth(factor.growth, inner)
    context.findings.push({
      line: context.lineAt(node.from),
      growth: cost,
      message: `${node.name === 'ForStatement' ? 'for' : node.name === 'WhileStatement' ? 'while' : 'do…while'} loop: ${factor.reason}`,
    })
    return cost
  }

  if (node.name === 'CallExpression') return analyzeCall(context, node, scope)

  return analyzeRegion(context, node, scope)
}

/** Sequential composition: the cost of everything directly inside `node`. */
function analyzeRegion(context: Context, node: SyntaxNode | null, scope: FunctionInfo | null): Growth {
  if (!node) return CONSTANT
  let total = CONSTANT
  for (const child of children(node)) {
    total = maxGrowth(total, analyzeStatement(context, child, scope))
  }
  return total
}

function analyzeCall(context: Context, call: SyntaxNode, scope: FunctionInfo | null): Growth {
  const { plain, qualified, property } = calleeName(context, call)
  const args = call.getChild('ArgList')
  // Arguments can hold calls and callbacks of their own.
  const cost = args ? analyzeRegion(context, args, scope) : CONSTANT

  const qualifiedCost = QUALIFIED_CALLS[qualified]
  if (qualifiedCost) {
    context.findings.push({
      line: context.lineAt(call.from),
      growth: qualifiedCost,
      message: `${qualified}() walks its input`,
    })
    return maxGrowth(cost, qualifiedCost)
  }

  // A self-call is accounted for by the recurrence, not here.
  if (scope && plain === scope.name) return cost

  const userFunction = context.functions.find((info) => info.name === plain && info.name !== '(anonymous)')
  if (userFunction) return maxGrowth(cost, resolveFunction(context, userFunction))

  const library = property ? LIBRARY_CALLS[property] : undefined
  if (library) {
    let callCost = library.growth
    if (library.perElement) {
      // The callback body runs once per element, so it multiplies rather
      // than sits beside the iteration.
      const callback = args ? children(args).find((child) => FUNCTION_NODES.has(child.name)) : undefined
      const callbackCost = callback ? analyzeStatement(context, functionBody(callback), scope) : CONSTANT
      callCost = multiplyGrowth(LINEAR, callbackCost)
    }
    context.findings.push({
      line: context.lineAt(call.from),
      growth: callCost,
      message: `.${library.label ?? property}() over the collection`,
    })
    return maxGrowth(cost, callCost)
  }

  if (property && CONSTANT_TIME_METHODS.has(property)) return cost
  if (plain && !/^(console|Math|Number|String|Boolean|parseInt|parseFloat|Symbol)$/.test(qualified.split('.')[0])) {
    context.unknownCalls.add(qualified || plain)
  }
  return cost
}

/** Growth of one function, memoized. Direct recursion is turned into a
 * recurrence and solved; a mutual-recursion cycle is reported rather than
 * guessed at. */
function resolveFunction(context: Context, info: FunctionInfo): Growth {
  const cached = context.resolved.get(info.node)
  if (cached) return cached
  if (cached === null) {
    // Already being resolved further up the stack: a cycle.
    context.notes.add('Mutual recursion was found; its depth cannot be read from the snippet, so it is assumed linear.')
    lowerConfidence(context, 'low')
    return LINEAR
  }
  context.resolved.set(info.node, null)

  const selfCalls = collectSelfCalls(context, info)
  // Work done per call, with the recursive calls themselves excluded: that
  // is exactly the `f(n)` term of `T(n) = a·T(n/b) + f(n)`.
  const work = analyzeStatement(context, info.body, info)

  let growth = work
  if (selfCalls.calls.length > 0) {
    const count = selfCalls.calls.length
    const reduction = readReduction(context, selfCalls.calls[0], info.params, readLocalShapes(context, info), count)

    if (selfCalls.insideLoop) {
      // A recursive call inside a loop branches once per item at every
      // level: the backtracking/permutation shape.
      growth = { kind: 'factorial' }
      context.findings.push({
        line: context.lineAt(selfCalls.calls[0].from),
        growth,
        message: `${info.name}() calls itself from inside a loop (branch per item)`,
      })
    } else if (reduction.kind === 'divide') {
      growth = solveDivideAndConquer(count, reduction.by, work)
      if (reduction.assumed) {
        context.notes.add(
          `${info.name}() hands each call a subset of its input; an even split is assumed, so this is the average case, not the worst.`,
        )
        lowerConfidence(context, 'medium')
      }
      context.findings.push({
        line: context.lineAt(selfCalls.calls[0].from),
        growth,
        message: `${info.name}() calls itself ${count}× on ${reduction.assumed ? 'a subset of' : `1/${reduction.by} of`} the input`,
      })
    } else {
      if (reduction.kind === 'unknown') {
        context.notes.add(
          `How ${info.name}() shrinks its input could not be read; it is assumed to drop one item per call.`,
        )
        lowerConfidence(context, 'low')
      }
      growth = solveDecrementRecursion(count, work)
      context.findings.push({
        line: context.lineAt(selfCalls.calls[0].from),
        growth,
        message: `${info.name}() calls itself ${count}× on a slightly smaller input`,
      })
    }
  }

  context.resolved.set(info.node, growth)
  return growth
}

function collectSelfCalls(context: Context, info: FunctionInfo): { calls: SyntaxNode[]; insideLoop: boolean } {
  const calls: SyntaxNode[] = []
  let insideLoop = false
  if (!info.body || info.name === '(anonymous)') return { calls, insideLoop }

  const walk = (node: SyntaxNode, loopDepth: number) => {
    for (const child of children(node)) {
      // Don't walk into a nested function: its own calls belong to it.
      if (FUNCTION_NODES.has(child.name) && child !== info.node) continue
      const nextDepth = LOOP_NODES.has(child.name) ? loopDepth + 1 : loopDepth
      if (child.name === 'CallExpression' && calleeName(context, child).plain === info.name) {
        calls.push(child)
        if (nextDepth > 0) insideLoop = true
      }
      walk(child, nextDepth)
    }
  }
  walk(info.body, 0)
  return { calls, insideLoop }
}

/** Estimates the complexity of a JavaScript or TypeScript snippet. Returns
 * a failure (rather than throwing) for input the estimator refuses: empty,
 * too long, or too broken to parse. */
export function analyzeComplexity(source: string): Analysis | AnalysisFailure {
  if (source.trim().length === 0) return { ok: false, reason: 'Paste a snippet to estimate.' }
  if (source.length > MAX_SOURCE_LENGTH) {
    return {
      ok: false,
      reason: `Snippet is ${source.length.toLocaleString('en-US')} characters; the limit is ${MAX_SOURCE_LENGTH.toLocaleString('en-US')}.`,
    }
  }

  const tree = parser.configure({ dialect: 'ts' }).parse(source)
  const context: Context = {
    source,
    lineAt: buildLineIndex(source),
    functions: [],
    resolved: new Map(),
    findings: [],
    notes: new Set(),
    unknownCalls: new Set(),
    confidence: { value: 'high' },
  }

  const root = tree.topNode
  context.functions = collectFunctions(context, root)

  let errorNodes = 0
  const cursor = root.cursor()
  do {
    if (cursor.type.isError) errorNodes += 1
  } while (cursor.next())
  if (errorNodes > 0) {
    context.notes.add('Part of the snippet could not be parsed as JavaScript or TypeScript; that part was skipped.')
    lowerConfidence(context, errorNodes > 5 ? 'low' : 'medium')
  }

  // Only named functions are reported and rolled into the verdict. An
  // anonymous callback is already charged where it is passed (see the
  // `perElement` handling in `analyzeCall`), so resolving it again here
  // would double-count both its cost and its findings.
  const functions: FunctionReport[] = context.functions
    .filter((info) => info.name !== '(anonymous)')
    .map((info) => ({
      name: info.name,
      line: info.line,
      growth: resolveFunction(context, info),
      recursive: collectSelfCalls(context, info).calls.length > 0,
    }))

  // Top-level code runs on its own; a function only costs something where
  // it is called, but a snippet is usually pasted *as* a function, so the
  // verdict is the worst of everything present.
  const topLevel = analyzeRegion(context, root, null)
  const growth = functions.reduce((worst, report) => maxGrowth(worst, report.growth), topLevel)

  if (context.unknownCalls.size > 0) {
    const names = [...context.unknownCalls].slice(0, 4).join(', ')
    context.notes.add(`Calls the estimator cannot see into (${names}) are counted as O(1).`)
    lowerConfidence(context, 'medium')
  }

  return {
    ok: true,
    growth,
    confidence: context.confidence.value,
    // Worst first, so the line driving the verdict is the one at the top.
    // Comparing the growth terms is the only ordering that means anything:
    // sorting on the name of the kind put every polynomial ahead of every
    // exponential, and ignored degree entirely, so the line driving the
    // verdict could fall outside the heaviest few the widget shows.
    findings: context.findings.sort((a, b) => compareGrowth(b.growth, a.growth) || a.line - b.line),
    functions,
    notes: [...context.notes],
  }
}

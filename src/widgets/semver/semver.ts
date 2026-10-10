/** SemVer 2.0.0 parsing, validation, precedence, and npm-style range
 * matching. Self-contained (no `semver` dependency) so the widget can
 * explain *why* a string is not compliant instead of only rejecting it. */

export interface SemVer {
  major: number
  minor: number
  patch: number
  prerelease: string[]
  build: string[]
}

export interface ValidationResult {
  /** Present only when the input is fully SemVer 2.0.0 compliant. */
  version: SemVer | null
  /** Human-readable spec violations, empty when `version` is set. */
  issues: string[]
  /** A compliant version the input most likely meant, when one can be
   * derived (e.g. `v1.2` → `1.2.0`). Null for valid input. */
  suggestion: string | null
}

const NUMERIC = /^\d+$/
const IDENTIFIER_CHARS = /^[0-9A-Za-z-]+$/

/** Strict SemVer 2.0.0 parse, straight from the spec's recommended regex. */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export function parse(input: string): SemVer | null {
  const match = SEMVER_RE.exec(input)
  if (!match) return null
  const [major, minor, patch] = [match[1], match[2], match[3]].map(Number)
  if (![major, minor, patch].every(Number.isSafeInteger)) return null
  return {
    major,
    minor,
    patch,
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  }
}

export function format(version: SemVer): string {
  let out = `${version.major}.${version.minor}.${version.patch}`
  if (version.prerelease.length) out += `-${version.prerelease.join('.')}`
  if (version.build.length) out += `+${version.build.join('.')}`
  return out
}

/** Validates against SemVer 2.0.0 and, on failure, lists every rule the
 * input breaks (rather than the first) plus a best-guess fix. */
export function validate(input: string): ValidationResult {
  const strict = parse(input)
  if (strict) return { version: strict, issues: [], suggestion: null }

  const issues: string[] = []
  let rest = input
  if (rest.trim() === '') return { version: null, issues: ['Version is empty'], suggestion: null }
  if (rest !== rest.trim()) {
    issues.push('Leading or trailing whitespace is not allowed')
    rest = rest.trim()
  }
  const prefix = /^(v|V|=)\s*/.exec(rest)
  if (prefix) {
    issues.push(`The "${prefix[1]}" prefix is a common convention but not part of a semantic version`)
    rest = rest.slice(prefix[0].length)
  }

  // Build metadata starts at the first "+", pre-release at the first "-"
  // before it (hyphens are legal inside both, so only the first counts).
  const plus = rest.indexOf('+')
  const buildRaw = plus === -1 ? null : rest.slice(plus + 1)
  const beforeBuild = plus === -1 ? rest : rest.slice(0, plus)
  const dash = beforeBuild.indexOf('-')
  const preRaw = dash === -1 ? null : beforeBuild.slice(dash + 1)
  const core = dash === -1 ? beforeBuild : beforeBuild.slice(0, dash)

  const coreParts = core.split('.')
  const fixedCore: string[] = []
  const names = ['Major', 'Minor', 'Patch']
  let coreFixable = true
  if (coreParts.length < 3) {
    issues.push(`Version core needs three numbers (MAJOR.MINOR.PATCH), found ${coreParts.length}`)
  } else if (coreParts.length > 3) {
    issues.push(`Version core has ${coreParts.length} numbers, expected exactly three (MAJOR.MINOR.PATCH)`)
    coreFixable = false
  }
  coreParts.slice(0, 3).forEach((part, index) => {
    const name = names[index]
    if (part === '') {
      issues.push(`${name} version is empty`)
      coreFixable = false
    } else if (!NUMERIC.test(part)) {
      issues.push(`${name} version "${part}" must be a non-negative integer`)
      coreFixable = false
    } else {
      if (part.length > 1 && part.startsWith('0')) {
        issues.push(`${name} version "${part}" must not have leading zeros`)
      }
      if (!Number.isSafeInteger(Number(part))) {
        issues.push(`${name} version "${part}" is too large to compare reliably here`)
        coreFixable = false
      }
      fixedCore.push(String(Number(part)))
    }
  })
  while (fixedCore.length < 3) fixedCore.push('0')

  const fixedPre = preRaw === null ? null : checkIdentifiers(preRaw, 'Pre-release', true, issues)
  const fixedBuild = buildRaw === null ? null : checkIdentifiers(buildRaw, 'Build metadata', false, issues)

  let suggestion: string | null = null
  if (coreFixable && fixedPre !== false && fixedBuild !== false) {
    let candidate = fixedCore.join('.')
    if (fixedPre) candidate += `-${fixedPre}`
    if (fixedBuild) candidate += `+${fixedBuild}`
    if (parse(candidate) && candidate !== input) suggestion = candidate
  }

  // The checks above should always find something for a non-matching
  // input; this is a safety net so an invalid version never reads as clean.
  if (issues.length === 0) issues.push('Does not match the SemVer 2.0.0 grammar')
  return { version: null, issues, suggestion }
}

/** Checks dot-separated identifiers, pushing issues. Returns the cleaned
 * string to use in a suggestion, '' when nothing usable remains, or false
 * when the section can't be repaired automatically. */
function checkIdentifiers(raw: string, label: string, numericRules: boolean, issues: string[]): string | false {
  if (raw === '') {
    issues.push(`${label} is empty after its separator`)
    return ''
  }
  const fixed: string[] = []
  let fixable = true
  for (const id of raw.split('.')) {
    if (id === '') {
      issues.push(`${label} contains an empty identifier`)
      continue
    }
    if (!IDENTIFIER_CHARS.test(id)) {
      issues.push(`${label} identifier "${id}" may only contain ASCII letters, digits, and hyphens`)
      fixable = false
      continue
    }
    if (numericRules && NUMERIC.test(id) && id.length > 1 && id.startsWith('0')) {
      issues.push(`${label} identifier "${id}" is numeric and must not have leading zeros`)
      fixed.push(id.replace(/^0+(?=\d)/, ''))
      continue
    }
    fixed.push(id)
  }
  return fixable ? fixed.join('.') : false
}

function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1
}

function compareIdentifiers(a: string, b: string): number {
  const aNum = NUMERIC.test(a)
  const bNum = NUMERIC.test(b)
  if (aNum && bNum) return compareNumbers(Number(a), Number(b))
  if (aNum) return -1
  if (bNum) return 1
  return a === b ? 0 : a < b ? -1 : 1
}

/** Precedence per SemVer 2.0.0 section 11. Build metadata is ignored. */
export function compare(a: SemVer, b: SemVer): number {
  const core = compareNumbers(a.major, b.major) || compareNumbers(a.minor, b.minor) || compareNumbers(a.patch, b.patch)
  if (core) return core
  if (!a.prerelease.length && !b.prerelease.length) return 0
  if (!a.prerelease.length) return 1
  if (!b.prerelease.length) return -1
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let i = 0; i < length; i++) {
    if (a.prerelease[i] === undefined) return -1
    if (b.prerelease[i] === undefined) return 1
    const result = compareIdentifiers(a.prerelease[i], b.prerelease[i])
    if (result) return result
  }
  return 0
}

export type BumpKind = 'major' | 'minor' | 'patch'

/** Next release of each kind, following npm's `inc` for release versions:
 * a pre-release of X.Y.Z bumps to X.Y.Z itself when that's the next step. */
export function bump(version: SemVer, kind: BumpKind): SemVer {
  const { major, minor, patch } = version
  const pre = version.prerelease.length > 0
  const base = { prerelease: [], build: [] }
  if (kind === 'major') {
    return pre && minor === 0 && patch === 0
      ? { ...base, major, minor, patch }
      : { ...base, major: major + 1, minor: 0, patch: 0 }
  }
  if (kind === 'minor') {
    return pre && patch === 0 ? { ...base, major, minor, patch } : { ...base, major, minor: minor + 1, patch: 0 }
  }
  return pre ? { ...base, major, minor, patch } : { ...base, major, minor, patch: patch + 1 }
}

// ---------------------------------------------------------------------------
// Ranges (npm / node-semver syntax)
// ---------------------------------------------------------------------------

export type Operator = '<' | '<=' | '>' | '>=' | '='

export interface Comparator {
  operator: Operator
  version: SemVer
}

/** One `||` alternative: every comparator must hold. Empty means "any". */
export interface ComparatorSet {
  source: string
  comparators: Comparator[]
}

export type RangeParseResult = { ok: true; sets: ComparatorSet[] } | { ok: false; error: string }

type Part = number | null // null = wildcard (x, X, *, or missing)

interface Partial {
  major: Part
  minor: Part
  patch: Part
  prerelease: string[]
}

const PARTIAL_RE =
  /^v?(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*])(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)?)?$/
const COMPARATOR_RE = /^(<=|>=|<|>|=|~>|~|\^)?(.*)$/

function toPart(raw: string | undefined): Part {
  if (raw === undefined || raw === 'x' || raw === 'X' || raw === '*') return null
  return Number(raw)
}

function parsePartial(raw: string): Partial | null {
  if (raw === '') return { major: null, minor: null, patch: null, prerelease: [] }
  const match = PARTIAL_RE.exec(raw)
  if (!match) return null
  const major = toPart(match[1])
  // Anything after a wildcard is a wildcard too: `1.x.3` means `1.x`.
  const minor = major === null ? null : toPart(match[2])
  const patch = minor === null ? null : toPart(match[3])
  if ([major, minor, patch].some((part) => part !== null && !Number.isSafeInteger(part))) return null
  const prerelease = patch !== null && match[4] ? match[4].split('.') : []
  return { major, minor, patch, prerelease }
}

function v(major: number, minor: number, patch: number, prerelease: string[] = []): SemVer {
  return { major, minor, patch, prerelease, build: [] }
}

/** `-0` is the lowest possible pre-release, so `<2.0.0-0` excludes every
 * 2.0.0 pre-release as well as 2.0.0 itself (node-semver's convention). */
const upper = (major: number, minor: number, patch: number): Comparator => ({
  operator: '<',
  version: v(major, minor, patch, ['0']),
})
const lower = (major: number, minor: number, patch: number, prerelease: string[] = []): Comparator => ({
  operator: '>=',
  version: v(major, minor, patch, prerelease),
})

function desugarTilde(p: Partial): Comparator[] {
  if (p.major === null) return []
  if (p.minor === null) return [lower(p.major, 0, 0), upper(p.major + 1, 0, 0)]
  return [lower(p.major, p.minor, p.patch ?? 0, p.prerelease), upper(p.major, p.minor + 1, 0)]
}

function desugarCaret(p: Partial): Comparator[] {
  if (p.major === null) return []
  if (p.minor === null) return [lower(p.major, 0, 0), upper(p.major + 1, 0, 0)]
  const from = lower(p.major, p.minor, p.patch ?? 0, p.prerelease)
  if (p.major > 0) return [from, upper(p.major + 1, 0, 0)]
  if (p.minor > 0 || p.patch === null) return [from, upper(0, p.minor + 1, 0)]
  return [from, upper(0, 0, p.patch + 1)]
}

function desugarPrimitive(operator: Operator | '', p: Partial): Comparator[] {
  const { major, minor, patch } = p
  if (major !== null && minor !== null && patch !== null) {
    return [{ operator: operator || '=', version: v(major, minor, patch, p.prerelease) }]
  }
  // X-ranges: at least one wildcard.
  if (major === null) {
    return operator === '<' || operator === '>' ? [upper(0, 0, 0)] : []
  }
  const next = minor === null ? v(major + 1, 0, 0) : v(major, minor + 1, 0)
  const floor = v(major, minor ?? 0, 0)
  switch (operator) {
    case '>':
      return [lower(next.major, next.minor, 0)]
    case '>=':
      return [lower(floor.major, floor.minor, 0)]
    case '<':
      return [upper(floor.major, floor.minor, 0)]
    case '<=':
      return [upper(next.major, next.minor, 0)]
    default:
      return [lower(floor.major, floor.minor, 0), upper(next.major, next.minor, 0)]
  }
}

function desugarHyphen(fromRaw: string, toRaw: string): Comparator[] | string {
  const from = parsePartial(fromRaw)
  if (!from) return `"${fromRaw}" is not a valid version`
  const to = parsePartial(toRaw)
  if (!to) return `"${toRaw}" is not a valid version`
  const result: Comparator[] = []
  if (from.major !== null) result.push(lower(from.major, from.minor ?? 0, from.patch ?? 0, from.prerelease))
  if (to.major !== null) {
    if (to.minor === null) result.push(upper(to.major + 1, 0, 0))
    else if (to.patch === null) result.push(upper(to.major, to.minor + 1, 0))
    else result.push({ operator: '<=', version: v(to.major, to.minor, to.patch, to.prerelease) })
  }
  return result
}

function parseComparator(token: string): Comparator[] | string {
  const [, op = '', rest] = COMPARATOR_RE.exec(token) as RegExpExecArray
  const partial = parsePartial(rest)
  if (!partial) return `"${token}" is not a valid comparator`
  if (op === '~' || op === '~>') return desugarTilde(partial)
  if (op === '^') return desugarCaret(partial)
  return desugarPrimitive(op as Operator | '', partial)
}

export function parseRange(input: string): RangeParseResult {
  const sets: ComparatorSet[] = []
  for (const rawSet of input.split('||')) {
    const source = rawSet.trim().replace(/\s+/g, ' ')
    const hyphen = /^(\S+) - (\S+)$/.exec(source)
    if (hyphen) {
      const comparators = desugarHyphen(hyphen[1], hyphen[2])
      if (typeof comparators === 'string') return { ok: false, error: comparators }
      sets.push({ source, comparators })
      continue
    }
    // Allow a space between an operator and its version (`>= 1.2.3`).
    const tokens = source
      .replace(/(<=|>=|<|>|=|~>|~|\^)\s+/g, '$1')
      .split(' ')
      .filter(Boolean)
    const comparators: Comparator[] = []
    for (const token of tokens) {
      const parsed = parseComparator(token)
      if (typeof parsed === 'string') return { ok: false, error: parsed }
      comparators.push(...parsed)
    }
    sets.push({ source: source || '*', comparators })
  }
  return { ok: true, sets }
}

function testComparator(version: SemVer, { operator, version: target }: Comparator): boolean {
  const result = compare(version, target)
  switch (operator) {
    case '<':
      return result < 0
    case '<=':
      return result <= 0
    case '>':
      return result > 0
    case '>=':
      return result >= 0
    case '=':
      return result === 0
  }
}

/** node-semver's rule: a pre-release only satisfies a set when some
 * comparator in it names a pre-release on the same MAJOR.MINOR.PATCH, so
 * `^1.2.3` doesn't silently pull in `1.3.0-beta`. */
export function satisfiesSet(version: SemVer, set: ComparatorSet, includePrerelease = false): boolean {
  if (!set.comparators.every((comparator) => testComparator(version, comparator))) return false
  if (!version.prerelease.length || includePrerelease) return true
  return set.comparators.some(
    ({ version: target }) =>
      target.prerelease.length > 0 &&
      target.major === version.major &&
      target.minor === version.minor &&
      target.patch === version.patch,
  )
}

export function formatComparator({ operator, version }: Comparator): string {
  return `${operator === '=' ? '' : operator}${format(version)}`
}

export function formatSet(set: ComparatorSet): string {
  return set.comparators.length ? set.comparators.map(formatComparator).join(' ') : '* (any version)'
}

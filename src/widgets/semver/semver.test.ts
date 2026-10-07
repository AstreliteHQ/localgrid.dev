import { describe, expect, it } from 'vitest'
import { bump, compare, format, formatSet, parse, parseRange, satisfiesSet, validate, type SemVer } from './semver'

function ver(input: string): SemVer {
  const parsed = parse(input)
  if (!parsed) throw new Error(`test fixture "${input}" is not valid`)
  return parsed
}

function satisfies(version: string, range: string, includePrerelease = false): boolean {
  const result = parseRange(range)
  if (!result.ok) throw new Error(result.error)
  return result.sets.some((set) => satisfiesSet(ver(version), set, includePrerelease))
}

function desugar(range: string): string {
  const result = parseRange(range)
  if (!result.ok) throw new Error(result.error)
  return result.sets.map(formatSet).join(' || ')
}

describe('parse', () => {
  it('splits a full version into its parts', () => {
    expect(parse('1.2.3-alpha.1+build.5')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['alpha', '1'],
      build: ['build', '5'],
    })
  })

  it.each([
    '0.0.4',
    '1.2.3',
    '10.20.30',
    '1.1.2-prerelease+meta',
    '1.0.0-alpha-a.b-c-somethinglong+build.1-aef.1-its-okay',
    '1.0.0-0A.is.legal',
    '2.0.0+build.1848',
  ])('accepts the spec example %s', (input) => {
    expect(parse(input)).not.toBeNull()
    expect(format(ver(input))).toBe(input)
  })

  it.each(['1', '1.2', '1.2.3-0123', '01.1.1', '1.2.3.4', 'v1.2.3', '1.2.3-', '1.2.3+', '+invalid', '1.2.3-alpha..1'])(
    'rejects %s',
    (input) => {
      expect(parse(input)).toBeNull()
    },
  )
})

describe('validate', () => {
  it('reports no issues for a compliant version', () => {
    expect(validate('1.0.0-rc.1')).toMatchObject({ issues: [], suggestion: null })
  })

  it('explains a v prefix and suggests the bare version', () => {
    const result = validate('v1.2.3')
    expect(result.version).toBeNull()
    expect(result.issues).toEqual([expect.stringContaining('"v" prefix')])
    expect(result.suggestion).toBe('1.2.3')
  })

  it('pads a short core and strips leading zeros in the suggestion', () => {
    const result = validate('01.2')
    expect(result.issues).toEqual([expect.stringContaining('three numbers'), expect.stringContaining('leading zeros')])
    expect(result.suggestion).toBe('1.2.0')
  })

  it('flags numeric pre-release identifiers with leading zeros', () => {
    const result = validate('1.2.3-alpha.01')
    expect(result.issues).toEqual([expect.stringContaining('"01"')])
    expect(result.suggestion).toBe('1.2.3-alpha.1')
  })

  it('flags invalid characters without guessing a fix', () => {
    const result = validate('1.2.3-beta_1')
    expect(result.issues).toEqual([expect.stringContaining('"beta_1"')])
    expect(result.suggestion).toBeNull()
  })

  it('flags empty identifiers and empty sections', () => {
    expect(validate('1.2.3-a..b').issues).toEqual([expect.stringContaining('empty identifier')])
    expect(validate('1.2.3+').issues).toEqual([expect.stringContaining('Build metadata is empty')])
    expect(validate('1.2.3+').suggestion).toBe('1.2.3')
  })

  it('rejects four-part versions', () => {
    const result = validate('1.2.3.4')
    expect(result.issues).toEqual([expect.stringContaining('expected exactly three')])
    expect(result.suggestion).toBeNull()
  })

  it('treats empty input as an issue', () => {
    expect(validate('  ').issues).toEqual(['Version is empty'])
  })
})

describe('compare', () => {
  it('orders versions per the spec precedence example', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '2.0.0',
      '2.1.0',
      '2.1.1',
    ]
    const shuffled = [...ordered].reverse()
    expect(shuffled.map(ver).sort(compare).map(format)).toEqual(ordered)
  })

  it('ignores build metadata', () => {
    expect(compare(ver('1.0.0+a'), ver('1.0.0+b'))).toBe(0)
  })
})

describe('bump', () => {
  it('increments release versions', () => {
    expect(format(bump(ver('1.2.3+b'), 'major'))).toBe('2.0.0')
    expect(format(bump(ver('1.2.3'), 'minor'))).toBe('1.3.0')
    expect(format(bump(ver('1.2.3'), 'patch'))).toBe('1.2.4')
  })

  it('promotes a pre-release to its release when that is the next step', () => {
    expect(format(bump(ver('2.0.0-rc.1'), 'major'))).toBe('2.0.0')
    expect(format(bump(ver('1.3.0-beta'), 'minor'))).toBe('1.3.0')
    expect(format(bump(ver('1.2.4-beta'), 'patch'))).toBe('1.2.4')
    expect(format(bump(ver('1.2.4-beta'), 'major'))).toBe('2.0.0')
  })
})

describe('parseRange', () => {
  it.each([
    ['^1.2.3', '>=1.2.3 <2.0.0-0'],
    ['^0.2.3', '>=0.2.3 <0.3.0-0'],
    ['^0.0.3', '>=0.0.3 <0.0.4-0'],
    ['^0.0', '>=0.0.0 <0.1.0-0'],
    ['^1.x', '>=1.0.0 <2.0.0-0'],
    ['~1.2.3', '>=1.2.3 <1.3.0-0'],
    ['~1.2', '>=1.2.0 <1.3.0-0'],
    ['~1', '>=1.0.0 <2.0.0-0'],
    ['~> 1.2', '>=1.2.0 <1.3.0-0'],
    ['1.x', '>=1.0.0 <2.0.0-0'],
    ['1.2.*', '>=1.2.0 <1.3.0-0'],
    ['*', '* (any version)'],
    ['', '* (any version)'],
    ['>1.2', '>=1.3.0'],
    ['<=1.2', '<1.3.0-0'],
    ['>= 1.2.3 < 2', '>=1.2.3 <2.0.0-0'],
    ['1.2.3 - 2.3.4', '>=1.2.3 <=2.3.4'],
    ['1.2 - 2.3', '>=1.2.0 <2.4.0-0'],
    ['1.2.3 - 2', '>=1.2.3 <3.0.0-0'],
    ['=1.2.3', '1.2.3'],
    ['1.2.3 || >=2.5.0', '1.2.3 || >=2.5.0'],
  ])('desugars %s to %s', (range, expected) => {
    expect(desugar(range)).toBe(expected)
  })

  it('reports the offending token', () => {
    expect(parseRange('>=1.2.3 foo')).toEqual({ ok: false, error: '"foo" is not a valid comparator' })
    expect(parseRange('1.2.3 - bar')).toEqual({ ok: false, error: '"bar" is not a valid version' })
  })
})

describe('range matching', () => {
  it.each([
    ['1.5.0', '^1.2.3', true],
    ['2.0.0', '^1.2.3', false],
    ['1.2.2', '^1.2.3', false],
    ['0.2.9', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['2.3.4', '1.2.3 - 2.3.4', true],
    ['2.3.5', '1.2.3 - 2.3.4', false],
    ['3.0.0', '<2 || >=3', true],
    ['2.5.0', '<2 || >=3', false],
    ['9.9.9', '*', true],
    ['1.2.3+build', '1.2.3', true],
  ])('%s in %s is %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected)
  })

  it('only lets pre-releases match a comparator on the same core version', () => {
    expect(satisfies('1.2.3-beta.2', '^1.2.3-beta.1')).toBe(true)
    expect(satisfies('1.3.0-beta', '^1.2.3-beta.1')).toBe(false)
    expect(satisfies('1.3.0-beta', '^1.2.3')).toBe(false)
  })

  it('lets pre-releases match anywhere when includePrerelease is on', () => {
    expect(satisfies('1.3.0-beta', '^1.2.3', true)).toBe(true)
    expect(satisfies('2.0.0-beta', '^1.2.3', true)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { describeRef, extractRefs, isSafeHttpUrl, parseRef, splitRefs } from './refs'

describe('parseRef', () => {
  it.each([
    ['https://github.com/org/repo/pull/42', 'pull', 'PR #42', 'org/repo'],
    ['https://github.com/org/repo/pull/42/files?w=1', 'pull', 'PR #42', 'org/repo'],
    ['https://github.com/org/repo/issues/7/', 'issue', '#7', 'org/repo'],
    ['https://gitlab.com/group/sub/project/-/merge_requests/42', 'pull', '!42', 'group/sub/project'],
    ['https://gitlab.example.com/team/app/-/merge_requests/3/diffs', 'pull', '!3', 'team/app'],
    ['https://gitlab.com/group/project/-/issues/9', 'issue', '#9', 'group/project'],
    ['https://gitlab.com/group/project/-/work_items/12', 'issue', '#12', 'group/project'],
    ['https://gitlab.example.com/groups/team/sub/-/work_items/5?show=x', 'issue', '#5', 'team/sub'],
    [
      'https://jazz.net:9443/ccm/web/projects/My%20Project#action=com.ibm.team.workitem.viewWorkItem&id=1234',
      'issue',
      '#1234',
      'My Project',
    ],
    [
      'https://jazz.net/ccm1/web/projects/Core#action=com.ibm.team.workitem.viewWorkItem&id=7&tab=links',
      'issue',
      '#7',
      'Core',
    ],
    ['https://jazz.net:9443/ccm/resource/itemName/com.ibm.team.workitem.WorkItem/1234', 'issue', '#1234', 'jazz.net'],
    [
      'https://jazz.net/ccm/web/projects/Core#action=com.ibm.team.dashboard.viewDashboard',
      'link',
      'jazz.net',
      undefined,
    ],
    [
      'https://jazz.net/ccm/web/projects/Core#action=com.ibm.team.workitem.viewWorkItem&id=abc',
      'link',
      'jazz.net',
      undefined,
    ],
    ['https://jazz.net/ccm/resource/itemName/com.ibm.team.workitem.WorkItem/', 'link', 'jazz.net', undefined],
    ['https://jira.example.com/browse/PROJ-123', 'ticket', 'PROJ-123', undefined],
    ['https://linear.app/example/issue/ENG-12/fix-login', 'ticket', 'ENG-12', undefined],
    ['PROJ-123', 'ticket', 'PROJ-123', undefined],
    ['https://www.example.com/file/abc', 'link', 'example.com', undefined],
    ['https://github.com/org/repo', 'link', 'github.com', undefined],
    ['needs review', 'text', 'needs review', undefined],
  ])('reads %s as a %s labeled %s', (raw, kind, label, detail) => {
    const parsed = parseRef(raw)
    expect([parsed.kind, parsed.label, parsed.detail]).toEqual([kind, label, detail])
  })

  it('links only safe http(s) URLs', () => {
    expect(parseRef('https://github.com/org/repo/pull/42').href).toBe('https://github.com/org/repo/pull/42')
    expect(parseRef('PROJ-1').href).toBeNull()
    expect(parseRef('javascript:alert(1)')).toMatchObject({ kind: 'text', href: null })
    expect(parseRef('data:text/html,<script>alert(1)</script>')).toMatchObject({ kind: 'text', href: null })
  })
})

describe('describeRef', () => {
  it('names a pull or issue with where it lives', () => {
    expect(describeRef(parseRef('https://github.com/org/repo/pull/42'))).toBe('PR #42 in org/repo')
  })

  it('names an EWM work item after its project area', () => {
    const url = 'https://jazz.net:9443/ccm/web/projects/My%20Project#action=com.ibm.team.workitem.viewWorkItem&id=12'
    expect(describeRef(parseRef(url))).toBe('#12 in My Project')
    expect(parseRef(url).href).toBe(url)
  })

  it('uses the label alone otherwise', () => {
    expect(describeRef(parseRef('PROJ-1'))).toBe('PROJ-1')
    expect(describeRef(parseRef('https://example.com/a'))).toBe('example.com')
  })
})

describe('extractRefs', () => {
  it('pulls URLs out of the text', () => {
    expect(extractRefs('Review https://github.com/o/r/pull/1 today')).toEqual({
      text: 'Review today',
      refs: ['https://github.com/o/r/pull/1'],
    })
  })

  it('leaves ticket-like words in the text', () => {
    expect(extractRefs('Switch to UTF-8')).toEqual({ text: 'Switch to UTF-8', refs: [] })
  })

  it('dedupes repeated URLs', () => {
    expect(extractRefs('a https://example.com/doc https://example.com/doc').refs).toEqual(['https://example.com/doc'])
  })
})

describe('splitRefs', () => {
  it('splits a paste made only of URLs and ticket keys', () => {
    expect(splitRefs(' PROJ-1\nhttps://example.com/doc ')).toEqual(['PROJ-1', 'https://example.com/doc'])
  })

  it('returns null for blank text or text with other words', () => {
    expect(splitRefs('  ')).toBeNull()
    expect(splitRefs('see https://example.com/doc')).toBeNull()
  })
})

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHttpUrl('https://gitlab.com/org/repo/-/merge_requests/42')).toBe(true)
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
  })

  it('rejects javascript:, data:, unparseable and empty text', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHttpUrl('not a url')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
  })
})

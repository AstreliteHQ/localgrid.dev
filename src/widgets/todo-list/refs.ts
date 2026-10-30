/** Turns a raw ref (a URL, a ticket key or any free tag) into what its chip
 * shows. Pure and offline: known URL shapes get a short label, anything
 * else still works as a plain link or tag. */

export type RefKind = 'pull' | 'issue' | 'ticket' | 'link' | 'text'

export interface ParsedRef {
  raw: string
  kind: RefKind
  label: string
  /** Where the ref lives, e.g. `org/repo`. Only set for pulls and issues. */
  detail?: string
  /** Only set for a safe http(s) URL. */
  href: string | null
}

type RefMatch = Pick<ParsedRef, 'kind' | 'label' | 'detail'>

const TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+$/
const NUMBER = /^\d+$/

/** Only http(s) URLs become a real link, so a pasted `javascript:` or
 * `data:` URL can never run when clicked. */
function parseSafeUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function isSafeHttpUrl(value: string): boolean {
  return parseSafeUrl(value) !== null
}

function matchGitHub(url: URL, segments: string[]): RefMatch | null {
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null
  const [owner, repo, type, number = ''] = segments
  if (!NUMBER.test(number)) return null
  const detail = `${owner}/${repo}`
  if (type === 'pull') return { kind: 'pull', label: `PR #${number}`, detail }
  if (type === 'issues') return { kind: 'issue', label: `#${number}`, detail }
  return null
}

/** Any host, since self-hosted GitLab is common. Work items are GitLab's
 * newer issue URLs, also found at group level under `/groups/<group>`. */
function matchGitLab(_url: URL, segments: string[]): RefMatch | null {
  const separator = segments.indexOf('-')
  if (separator < 1) return null
  const [type, number = ''] = segments.slice(separator + 1)
  if (!NUMBER.test(number)) return null
  const path = segments.slice(0, separator)
  const detail = (path[0] === 'groups' && path.length > 1 ? path.slice(1) : path).join('/')
  if (type === 'merge_requests') return { kind: 'pull', label: `!${number}`, detail }
  if (type === 'issues' || type === 'work_items') return { kind: 'issue', label: `#${number}`, detail }
  return null
}

const EWM_VIEW_ACTION = 'com.ibm.team.workitem.viewWorkItem'
const EWM_WORK_ITEM_TYPE = 'com.ibm.team.workitem.WorkItem'

/** Malformed escapes throw in decodeURIComponent; show them as typed. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** IBM EWM work items, on any host and context root (`/ccm`, `/ccm1`):
 * `/web/projects/<area>#action=...viewWorkItem&id=N` or
 * `/resource/itemName/com.ibm.team.workitem.WorkItem/N`. */
function matchEwm(url: URL, segments: string[]): RefMatch | null {
  const typeIndex = segments.indexOf(EWM_WORK_ITEM_TYPE)
  if (typeIndex > 0 && segments[typeIndex - 1] === 'itemName') {
    const number = segments[typeIndex + 1] ?? ''
    return NUMBER.test(number) ? { kind: 'issue', label: `#${number}`, detail: url.hostname } : null
  }
  if (!segments.includes('web')) return null
  const params = new URLSearchParams(url.hash.slice(1))
  const number = params.get('id') ?? ''
  if (params.get('action') !== EWM_VIEW_ACTION || !NUMBER.test(number)) return null
  const area = segments[segments.indexOf('projects') + 1]
  const detail = segments.includes('projects') && area ? decodeSegment(area) : url.hostname
  return { kind: 'issue', label: `#${number}`, detail }
}

/** Jira `/browse/KEY-1` and Linear `/team/issue/KEY-1/slug`. */
function matchTicketUrl(_url: URL, segments: string[]): RefMatch | null {
  const index = segments.findIndex((segment) => segment === 'browse' || segment === 'issue')
  const key = index >= 0 ? segments[index + 1] : undefined
  return key && TICKET_KEY.test(key) ? { kind: 'ticket', label: key } : null
}

const URL_MATCHERS = [matchGitHub, matchGitLab, matchEwm, matchTicketUrl]

export function parseRef(raw: string): ParsedRef {
  if (TICKET_KEY.test(raw)) return { raw, kind: 'ticket', label: raw, href: null }
  const url = parseSafeUrl(raw)
  if (!url) return { raw, kind: 'text', label: raw, href: null }
  const segments = url.pathname.split('/').filter(Boolean)
  for (const match of URL_MATCHERS) {
    const found = match(url, segments)
    if (found) return { raw, href: url.href, ...found }
  }
  return { raw, kind: 'link', label: url.hostname.replace(/^www\./, ''), href: url.href }
}

/** A readable name for a ref, e.g. "PR #42 in org/repo". */
export function describeRef(ref: ParsedRef): string {
  return ref.detail ? `${ref.label} in ${ref.detail}` : ref.label
}

/** Pulls URLs out of typed text. Ticket keys stay in the text, since words
 * like "UTF-8" look the same. */
export function extractRefs(draft: string): { text: string; refs: string[] } {
  const words: string[] = []
  const refs: string[] = []
  for (const token of draft.split(/\s+/).filter(Boolean)) {
    if (isSafeHttpUrl(token)) {
      if (!refs.includes(token)) refs.push(token)
    } else {
      words.push(token)
    }
  }
  return { text: words.join(' '), refs }
}

/** The tokens of a paste made only of URLs and ticket keys, or null when
 * it holds anything else and should be pasted as text. */
export function splitRefs(value: string): string[] | null {
  const tokens = value.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  return tokens.every((token) => TICKET_KEY.test(token) || isSafeHttpUrl(token)) ? tokens : null
}

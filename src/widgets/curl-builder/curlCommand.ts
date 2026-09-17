/** Pure command-assembly logic behind the cURL Command Builder widget.
 *
 * The widget itself only manages a request's data (method, URL, and the
 * headers/params/cookies/etc. the user added as blocks); everything about
 * turning that data into an actual, pasteable shell command lives here, so
 * the quoting and flag-ordering rules can be tested without a DOM.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

/** A single name/value row — a header, a query parameter, or a cookie.
 * `id` is only for React keys and editing in place; it plays no part in the
 * generated command. */
export interface KeyValueEntry {
  id: string
  name: string
  value: string
}

export interface FormFieldEntry extends KeyValueEntry {
  /** A file field becomes `-F 'name=@value'`, curl's own way of turning a
   * form field into a file upload from the given path. */
  isFile: boolean
}

export type BodyFormat = 'json' | 'urlencoded' | 'raw'

export interface BodyConfig {
  format: BodyFormat
  content: string
}

export type AuthScheme = 'basic' | 'bearer'

export interface AuthConfig {
  scheme: AuthScheme
  username: string
  password: string
  token: string
}

export interface FlagDefinition {
  id: string
  flag: string
  label: string
  description: string
}

/** Common boolean curl options, offered as toggles rather than as
 * repeatable blocks since none of them takes a value. Listed in the fixed
 * order they are emitted in, so toggling them on in any order still
 * produces the same command. */
export const FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    id: 'location',
    flag: '-L',
    label: 'Follow redirects',
    description: 'Follow 3xx redirects instead of stopping at the first one.',
  },
  { id: 'include', flag: '-i', label: 'Include headers', description: 'Print the response headers above the body.' },
  { id: 'silent', flag: '-s', label: 'Silent', description: 'Hide the progress meter.' },
  {
    id: 'verbose',
    flag: '-v',
    label: 'Verbose',
    description: 'Print the full request and response, including headers on the wire.',
  },
  {
    id: 'compressed',
    flag: '--compressed',
    label: 'Compressed',
    description: 'Ask for a compressed response and decompress it automatically.',
  },
  { id: 'insecure', flag: '-k', label: 'Insecure', description: 'Skip TLS certificate verification.' },
  {
    id: 'fail',
    flag: '-f',
    label: 'Fail fast',
    description: 'Exit with an error on an HTTP 4xx/5xx response instead of printing it.',
  },
]

export interface CurlRequest {
  method: HttpMethod
  url: string
  headers: KeyValueEntry[]
  queryParams: KeyValueEntry[]
  cookies: KeyValueEntry[]
  formFields: FormFieldEntry[]
  /** `null` when no Body block has been added; body content is otherwise
   * still emitted even if a header block or flag would make it redundant —
   * this reflects the request being built, not a "smart" second-guess of
   * it. */
  body: BodyConfig | null
  auth: AuthConfig | null
  flagIds: string[]
}

export type CommandFormat = 'single-line' | 'multi-line'

/** Wraps a value in single quotes for POSIX shells, the one quoting style
 * that needs no escaping for `$`, backticks, double quotes, or spaces — the
 * only character that can't appear literally inside single quotes is a
 * single quote itself, closed here by ending the quoted string, adding an
 * escaped quote, then reopening it. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Merges query param entries into a URL, matching whatever punctuation the
 * URL already ends with: appends `?` for the first param, `&` before every
 * one after, and neither again if the URL was already left ending in one. */
function appendQuery(url: string, params: KeyValueEntry[]): string {
  const active = params.filter((param) => param.name.trim() !== '')
  if (active.length === 0) return url
  const query = active.map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`).join('&')
  if (url.endsWith('?') || url.endsWith('&')) return `${url}${query}`
  return `${url}${url.includes('?') ? '&' : '?'}${query}`
}

/** One `curl` argument: a bare flag (`{ flag }`), a flag with its value
 * (`{ flag, value }`), or a positional argument with no flag at all — the
 * URL, always last. Kept separate from rendering so single-line and
 * multi-line output can share the exact same argument list. */
export interface CommandSegment {
  flag?: string
  /** Rendered through shellQuote — anything that can contain arbitrary
   * user text: a header, a body, the URL. */
  value?: string
  /** Rendered verbatim, no quoting. Only for tokens that are always one of
   * a small safe set, like the HTTP method — quoting `-X POST` would just
   * be visual noise nobody writes by hand. */
  rawValue?: string
}

/** Builds the ordered argument list for a request. Fixed grouping —
 * boolean flags, then auth, then headers, then cookies, then form fields,
 * then body, then the URL — rather than the order blocks were added in:
 * curl doesn't care what order its own options arrive in, and a fixed
 * order means the command doesn't reshuffle itself as blocks are added and
 * removed. */
export function buildCommandSegments(request: CurlRequest): CommandSegment[] {
  const segments: CommandSegment[] = [{ flag: '-X', rawValue: request.method }]

  for (const definition of FLAG_DEFINITIONS) {
    if (request.flagIds.includes(definition.id)) segments.push({ flag: definition.flag })
  }

  if (request.auth) {
    if (request.auth.scheme === 'basic') {
      if (request.auth.username !== '' || request.auth.password !== '') {
        segments.push({ flag: '-u', value: `${request.auth.username}:${request.auth.password}` })
      }
    } else if (request.auth.token.trim() !== '') {
      segments.push({ flag: '-H', value: `Authorization: Bearer ${request.auth.token}` })
    }
  }

  for (const header of request.headers) {
    if (header.name.trim() === '') continue
    segments.push({ flag: '-H', value: `${header.name}: ${header.value}` })
  }

  const cookies = request.cookies.filter((cookie) => cookie.name.trim() !== '')
  if (cookies.length > 0) {
    // curl reads one -b with several "name=value" pairs the same way it
    // reads several -b flags, and one flag is the more compact command.
    segments.push({ flag: '-b', value: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') })
  }

  for (const field of request.formFields) {
    if (field.name.trim() === '') continue
    segments.push({ flag: '-F', value: `${field.name}=${field.isFile ? '@' : ''}${field.value}` })
  }

  if (request.body && request.body.content.trim() !== '') {
    const hasContentType = request.headers.some((header) => header.name.trim().toLowerCase() === 'content-type')
    if (!hasContentType) {
      if (request.body.format === 'json') segments.push({ flag: '-H', value: 'Content-Type: application/json' })
      else if (request.body.format === 'urlencoded') {
        segments.push({ flag: '-H', value: 'Content-Type: application/x-www-form-urlencoded' })
      }
    }
    segments.push({ flag: '-d', value: request.body.content })
  }

  segments.push({ value: appendQuery(request.url.trim(), request.queryParams) })
  return segments
}

/** Renders a segment list as a real, pasteable command: everything on one
 * line, or one argument per line joined with a trailing `\` the way people
 * write curl commands by hand for readability. */
export function formatSegments(segments: CommandSegment[], format: CommandFormat): string {
  const rendered = segments.map((segment) => {
    if (segment.flag && segment.rawValue !== undefined) return `${segment.flag} ${segment.rawValue}`
    if (segment.flag && segment.value !== undefined) return `${segment.flag} ${shellQuote(segment.value)}`
    if (segment.flag) return segment.flag
    return shellQuote(segment.value ?? '')
  })
  const tokens = ['curl', ...rendered]
  if (format === 'single-line') return tokens.join(' ')
  return tokens.map((token, index) => (index === 0 ? token : `  ${token}`)).join(' \\\n')
}

export function buildCurlCommand(request: CurlRequest, format: CommandFormat): string {
  return formatSegments(buildCommandSegments(request), format)
}

/** Things about the assembled request worth flagging even though they
 * don't stop a command from being generated — curl will send exactly what
 * is described, ambiguity included. */
export function buildWarnings(request: CurlRequest): string[] {
  const warnings: string[] = []

  const hasManualAuthHeader = request.headers.some((header) => header.name.trim().toLowerCase() === 'authorization')
  if (request.auth && hasManualAuthHeader) {
    const authSends =
      request.auth.scheme === 'basic'
        ? request.auth.username !== '' || request.auth.password !== ''
        : request.auth.token.trim() !== ''
    if (authSends) warnings.push('An Authorization header and the Auth block are both set; curl will send both.')
  }

  const hasFormFields = request.formFields.some((field) => field.name.trim() !== '')
  if (request.body && request.body.content.trim() !== '' && hasFormFields) {
    warnings.push('A body and form fields are both set; most servers only read one of the two.')
  }

  return warnings
}

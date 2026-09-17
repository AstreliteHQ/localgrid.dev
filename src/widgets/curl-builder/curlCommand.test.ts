import { describe, expect, it } from 'vitest'
import {
  buildCurlCommand,
  buildWarnings,
  FLAG_DEFINITIONS,
  HTTP_METHODS,
  shellQuote,
  type CurlRequest,
  type KeyValueEntry,
} from './curlCommand'

function entry(name: string, value: string): KeyValueEntry {
  return { id: name, name, value }
}

/** A request with nothing added beyond a method and URL — every test
 * builds on this rather than repeating the empty-collection boilerplate. */
function baseRequest(overrides: Partial<CurlRequest> = {}): CurlRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    queryParams: [],
    cookies: [],
    formFields: [],
    body: null,
    auth: null,
    flagIds: [],
    ...overrides,
  }
}

describe('shellQuote', () => {
  it('wraps plain values in single quotes', () => {
    expect(shellQuote('hello')).toBe("'hello'")
    expect(shellQuote('')).toBe("''")
  })

  it('escapes an embedded single quote by closing, escaping, and reopening', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })

  it('leaves shell metacharacters untouched, since single quotes neutralize them', () => {
    expect(shellQuote('$HOME `id` "quoted" & | ; > <')).toBe('\'$HOME `id` "quoted" & | ; > <\'')
  })
})

describe('buildCurlCommand, minimal request', () => {
  it('always states the method explicitly, even for a plain GET', () => {
    expect(buildCurlCommand(baseRequest(), 'single-line')).toBe("curl -X GET 'https://api.example.com/users'")
  })

  it('covers every HTTP method', () => {
    for (const method of HTTP_METHODS) {
      expect(buildCurlCommand(baseRequest({ method }), 'single-line')).toContain(`-X ${method}`)
    }
  })
})

describe('buildCurlCommand, headers', () => {
  it('adds one -H per header, skipping blank names', () => {
    const command = buildCurlCommand(
      baseRequest({ headers: [entry('Accept', 'application/json'), entry('', 'ignored'), entry('X-Test', 'yes')] }),
      'single-line',
    )
    expect(command).toContain("-H 'Accept: application/json'")
    expect(command).toContain("-H 'X-Test: yes'")
    expect(command).not.toContain('ignored')
  })
})

describe('buildCurlCommand, query parameters', () => {
  it('appends a ? when the url has none', () => {
    expect(buildCurlCommand(baseRequest({ queryParams: [entry('page', '2')] }), 'single-line')).toContain(
      "'https://api.example.com/users?page=2'",
    )
  })

  it('joins multiple params with &, url-encoding names and values', () => {
    const command = buildCurlCommand(
      baseRequest({ url: 'https://x.test', queryParams: [entry('q', 'a b'), entry('tag', 'c++')] }),
      'single-line',
    )
    expect(command).toContain("'https://x.test?q=a%20b&tag=c%2B%2B'")
  })

  it('extends a url that already has a query string', () => {
    expect(
      buildCurlCommand(baseRequest({ url: 'https://x.test?a=1', queryParams: [entry('b', '2')] }), 'single-line'),
    ).toContain("'https://x.test?a=1&b=2'")
  })

  it('does not add a stray separator when the url already ends in one', () => {
    expect(
      buildCurlCommand(baseRequest({ url: 'https://x.test?', queryParams: [entry('a', '1')] }), 'single-line'),
    ).toContain("'https://x.test?a=1'")
  })

  it('leaves the url untouched when every query entry is blank', () => {
    expect(
      buildCurlCommand(baseRequest({ url: 'https://x.test', queryParams: [entry('', '')] }), 'single-line'),
    ).toContain("'https://x.test'")
  })
})

describe('buildCurlCommand, cookies', () => {
  it('combines every cookie into a single -b flag', () => {
    const command = buildCurlCommand(
      baseRequest({ cookies: [entry('session', 'abc'), entry('theme', 'dark')] }),
      'single-line',
    )
    expect(command).toContain("-b 'session=abc; theme=dark'")
    expect(command.match(/-b /g)).toHaveLength(1)
  })
})

describe('buildCurlCommand, form fields', () => {
  it('sends a plain field as name=value', () => {
    expect(
      buildCurlCommand(
        baseRequest({ formFields: [{ id: '1', name: 'title', value: 'hi', isFile: false }] }),
        'single-line',
      ),
    ).toContain("-F 'title=hi'")
  })

  it('prefixes a file field’s value with @', () => {
    expect(
      buildCurlCommand(
        baseRequest({ formFields: [{ id: '1', name: 'avatar', value: './me.png', isFile: true }] }),
        'single-line',
      ),
    ).toContain("-F 'avatar=@./me.png'")
  })
})

describe('buildCurlCommand, body', () => {
  it('sends json content with an auto Content-Type header', () => {
    const command = buildCurlCommand(baseRequest({ body: { format: 'json', content: '{"a":1}' } }), 'single-line')
    expect(command).toContain("-H 'Content-Type: application/json'")
    expect(command).toContain(`-d '{"a":1}'`)
  })

  it('sends urlencoded content with the matching Content-Type', () => {
    const command = buildCurlCommand(baseRequest({ body: { format: 'urlencoded', content: 'a=1&b=2' } }), 'single-line')
    expect(command).toContain("-H 'Content-Type: application/x-www-form-urlencoded'")
  })

  it('adds no Content-Type for raw content', () => {
    const command = buildCurlCommand(baseRequest({ body: { format: 'raw', content: 'plain text' } }), 'single-line')
    expect(command).not.toContain('Content-Type')
    expect(command).toContain("-d 'plain text'")
  })

  it('does not override a Content-Type header the user already set', () => {
    const command = buildCurlCommand(
      baseRequest({
        headers: [entry('Content-Type', 'application/vnd.custom+json')],
        body: { format: 'json', content: '{}' },
      }),
      'single-line',
    )
    expect(command.match(/Content-Type/g)).toHaveLength(1)
    expect(command).toContain('application/vnd.custom+json')
  })

  it('omits -d entirely for empty or whitespace-only content', () => {
    expect(buildCurlCommand(baseRequest({ body: { format: 'json', content: '' } }), 'single-line')).not.toContain('-d')
    expect(buildCurlCommand(baseRequest({ body: { format: 'json', content: '   ' } }), 'single-line')).not.toContain(
      '-d',
    )
  })
})

describe('buildCurlCommand, auth', () => {
  it('sends basic auth as -u user:pass', () => {
    expect(
      buildCurlCommand(
        baseRequest({ auth: { scheme: 'basic', username: 'alice', password: 'secret', token: '' } }),
        'single-line',
      ),
    ).toContain("-u 'alice:secret'")
  })

  it('still sends -u with an empty password, since that is a valid basic-auth pair', () => {
    expect(
      buildCurlCommand(
        baseRequest({ auth: { scheme: 'basic', username: 'alice', password: '', token: '' } }),
        'single-line',
      ),
    ).toContain("-u 'alice:'")
  })

  it('omits -u when both username and password are empty', () => {
    expect(
      buildCurlCommand(
        baseRequest({ auth: { scheme: 'basic', username: '', password: '', token: '' } }),
        'single-line',
      ),
    ).not.toContain('-u')
  })

  it('sends bearer auth as an Authorization header', () => {
    expect(
      buildCurlCommand(
        baseRequest({ auth: { scheme: 'bearer', username: '', password: '', token: 'xyz' } }),
        'single-line',
      ),
    ).toContain("-H 'Authorization: Bearer xyz'")
  })

  it('omits the header for an empty bearer token', () => {
    expect(
      buildCurlCommand(
        baseRequest({ auth: { scheme: 'bearer', username: '', password: '', token: '' } }),
        'single-line',
      ),
    ).not.toContain('Authorization')
  })
})

describe('buildCurlCommand, flags', () => {
  it('emits every requested flag', () => {
    const command = buildCurlCommand(baseRequest({ flagIds: ['location', 'insecure'] }), 'single-line')
    expect(command).toContain(' -L ')
    expect(command).toContain(' -k ')
  })

  it('emits flags in a fixed catalogue order regardless of toggle order', () => {
    const first = buildCurlCommand(baseRequest({ flagIds: ['fail', 'location'] }), 'single-line')
    const second = buildCurlCommand(baseRequest({ flagIds: ['location', 'fail'] }), 'single-line')
    expect(first).toBe(second)
    expect(first.indexOf('-L')).toBeLessThan(first.indexOf('-f'))
  })

  it('defines a flag for every entry, with a non-empty label', () => {
    for (const definition of FLAG_DEFINITIONS) {
      expect(definition.flag.startsWith('-')).toBe(true)
      expect(definition.label.length).toBeGreaterThan(0)
    }
  })
})

describe('buildCurlCommand, argument order', () => {
  it('groups arguments as method, flags, auth, headers, cookies, form fields, body, then the url', () => {
    const command = buildCurlCommand(
      baseRequest({
        method: 'POST',
        flagIds: ['location'],
        auth: { scheme: 'bearer', username: '', password: '', token: 'tok' },
        headers: [entry('Accept', 'application/json')],
        cookies: [entry('session', 'abc')],
        formFields: [{ id: '1', name: 'title', value: 'hi', isFile: false }],
        body: { format: 'raw', content: 'payload' },
      }),
      'single-line',
    )
    const order = [
      '-X POST',
      '-L',
      'Bearer tok',
      'Accept:',
      "-b 'session=abc'",
      "-F 'title=hi'",
      "-d 'payload'",
      'api.example.com',
    ]
    let lastIndex = -1
    for (const needle of order) {
      const index = command.indexOf(needle)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })
})

describe('buildCurlCommand, formatting', () => {
  const request = baseRequest({ method: 'POST', headers: [entry('Accept', 'application/json')] })

  it('renders single-line output as one line', () => {
    const command = buildCurlCommand(request, 'single-line')
    expect(command.split('\n')).toHaveLength(1)
    expect(command).toBe("curl -X POST -H 'Accept: application/json' 'https://api.example.com/users'")
  })

  it('renders multi-line output with a trailing backslash on every line but the last', () => {
    const command = buildCurlCommand(request, 'multi-line')
    const lines = command.split('\n')
    expect(lines[0]).toBe('curl \\')
    expect(lines[1]).toBe('  -X POST \\')
    expect(lines[lines.length - 1].endsWith('\\')).toBe(false)
    expect(lines[lines.length - 1].trim()).toBe("'https://api.example.com/users'")
  })
})

describe('buildWarnings', () => {
  it('warns about a duplicate Authorization header only when the auth block actually sends one', () => {
    const withToken = baseRequest({
      headers: [entry('Authorization', 'Bearer manual')],
      auth: { scheme: 'bearer', username: '', password: '', token: 'auto' },
    })
    expect(buildWarnings(withToken)).toContain(
      'An Authorization header and the Auth block are both set; curl will send both.',
    )

    const emptyAuth = baseRequest({
      headers: [entry('Authorization', 'Bearer manual')],
      auth: { scheme: 'bearer', username: '', password: '', token: '' },
    })
    expect(buildWarnings(emptyAuth)).toEqual([])
  })

  it('warns when a body and form fields are both populated', () => {
    const request = baseRequest({
      body: { format: 'raw', content: 'x' },
      formFields: [{ id: '1', name: 'a', value: 'b', isFile: false }],
    })
    expect(buildWarnings(request)).toContain(
      'A body and form fields are both set; most servers only read one of the two.',
    )
  })

  it('has nothing to say about a clean request', () => {
    expect(buildWarnings(baseRequest())).toEqual([])
  })
})

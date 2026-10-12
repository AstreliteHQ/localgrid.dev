import { describe, expect, it } from 'vitest'
import {
  copyMode,
  downloadName,
  formatFamily,
  hasRemoteResources,
  hexDump,
  htmlPreviewDocument,
  isTextualType,
  parseUriList,
  prettyJson,
  readClipboardItems,
  readDataTransfer,
  rtfToPlainText,
  textByteLength,
  type ClipboardRepresentation,
  type ClipboardWriteSupport,
} from './clipboardFormats'

function text(type: string, value: string): ClipboardRepresentation {
  return { type, family: formatFamily(type), size: textByteLength(value), text: value, blob: null, fileName: null }
}

function binary(type: string, bytes: number[]): ClipboardRepresentation {
  const blob = new Blob([new Uint8Array(bytes)], { type })
  return { type, family: formatFamily(type, true), size: blob.size, text: null, blob, fileName: null }
}

describe('formatFamily', () => {
  it.each([
    ['text/plain', 'text'],
    ['text/html', 'markup'],
    ['text/rtf', 'rich-text'],
    ['text/uri-list', 'link'],
    ['image/png', 'image'],
    ['image/svg+xml', 'image'],
    ['application/json', 'data'],
    ['application/ld+json', 'data'],
    ['text/csv', 'data'],
    ['web application/x-figma', 'custom'],
    ['application/x-vnd.custom', 'custom'],
  ])('puts %s in the %s family', (type, family) => {
    expect(formatFamily(type)).toBe(family)
  })

  it('treats an unknown pasted file as a file, not a custom format', () => {
    expect(formatFamily('application/pdf', true)).toBe('file')
    expect(formatFamily('', true)).toBe('file')
  })
})

describe('isTextualType', () => {
  it('reads text-like types as text and the rest as bytes', () => {
    expect(isTextualType('text/html')).toBe(true)
    expect(isTextualType('web text/custom')).toBe(true)
    expect(isTextualType('application/json')).toBe(true)
    expect(isTextualType('image/png')).toBe(false)
    expect(isTextualType('application/octet-stream')).toBe(false)
  })
})

describe('textByteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(textByteLength('abc')).toBe(3)
    expect(textByteLength('é')).toBe(2)
    expect(textByteLength('😀')).toBe(4)
  })
})

describe('readDataTransfer', () => {
  it('lists each string format and each file, skipping the Files marker and withheld formats', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    const data: Record<string, string> = {
      'text/plain': 'Hello',
      'text/html': '<b>Hello</b>',
      'application/x-private': '',
    }
    const result = readDataTransfer({
      types: ['text/plain', 'text/html', 'application/x-private', 'Files'],
      getData: (type) => data[type] ?? '',
      files: [file],
    })

    expect(result.map((entry) => entry.type)).toEqual(['text/plain', 'text/html', 'image/png'])
    expect(result[1]).toMatchObject({ family: 'markup', size: 12, text: '<b>Hello</b>' })
    expect(result[2]).toMatchObject({ family: 'image', size: 3, text: null, fileName: 'shot.png', blob: file })
  })

  it('returns nothing for an empty clipboard', () => {
    expect(readDataTransfer({ types: [], getData: () => '' })).toEqual([])
  })
})

describe('readClipboardItems', () => {
  it('decodes text formats and keeps binary ones as blobs', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const result = await readClipboardItems([
      {
        types: ['text/plain', 'image/png'],
        getType: async (type) => (type === 'image/png' ? png : new Blob(['hi'], { type })),
      },
    ])

    expect(result[0]).toMatchObject({ type: 'text/plain', text: 'hi', size: 2 })
    expect(result[1]).toMatchObject({ type: 'image/png', family: 'image', text: null, size: 4 })
  })

  it('skips a format the browser fails to hand over and keeps the rest', async () => {
    const result = await readClipboardItems([
      {
        types: ['text/plain', 'web application/x-broken'],
        getType: async (type) => {
          if (type === 'text/plain') return new Blob(['ok'], { type })
          throw new DOMException('Not readable', 'NotAllowedError')
        },
      },
    ])

    expect(result.map((entry) => entry.type)).toEqual(['text/plain'])
  })
})

describe('htmlPreviewDocument', () => {
  it('blocks every network load, remote images included', () => {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(htmlPreviewDocument('<p>x</p>'))?.[1]
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain('img-src data: blob:;')
    expect(csp).not.toMatch(/https?:/)
  })

  it('keeps link text but removes the href so a click cannot navigate the frame', () => {
    const doc = htmlPreviewDocument('<p><a href="https://evil.example/">click</a></p>')
    expect(doc).toContain('<a title="https://evil.example/">click</a>')
    expect(doc).not.toContain('href="https://evil.example/"')
  })
})

describe('hasRemoteResources', () => {
  it('spots remote images and stylesheet URLs', () => {
    expect(hasRemoteResources('<img src="https://t.example/p.gif">')).toBe(true)
    expect(hasRemoteResources('<img src=//cdn.example/a.png>')).toBe(true)
    expect(hasRemoteResources('<div style="background:url(\'http://x.example/b.png\')">')).toBe(true)
  })

  it('ignores plain links, which the preview disarms rather than blocks', () => {
    expect(hasRemoteResources('<a href="https://example.com/">site</a>')).toBe(false)
  })

  it('ignores inline data', () => {
    expect(hasRemoteResources('<img src="data:image/png;base64,AAAA"><b>hi</b>')).toBe(false)
  })
})

describe('copyMode', () => {
  const full: ClipboardWriteSupport = { items: true, supports: null }

  it('writes the formats every browser accepts natively', () => {
    expect(copyMode(text('text/plain', 'a'), full)).toBe('native')
    expect(copyMode(text('text/html', '<p>a</p>'), full)).toBe('native')
    expect(copyMode(binary('image/png', [1]), full)).toBe('native')
  })

  it('falls back to plain text for text formats the browser refuses', () => {
    expect(copyMode(text('text/rtf', '{\\rtf1 a}'), full)).toBe('as-text')
  })

  it('uses ClipboardItem.supports when the browser has it', () => {
    const support: ClipboardWriteSupport = { items: true, supports: (type) => type === 'text/rtf' }
    expect(copyMode(text('text/rtf', '{\\rtf1 a}'), support)).toBe('native')
  })

  it('cannot copy a binary format the browser refuses', () => {
    expect(copyMode(binary('image/jpeg', [1]), full)).toBe('none')
  })

  it('downgrades everything textual to plain text without ClipboardItem', () => {
    expect(copyMode(text('text/html', '<p>a</p>'), { items: false, supports: null })).toBe('as-text')
  })
})

describe('downloadName', () => {
  it('picks an extension from the MIME type', () => {
    expect(downloadName(text('text/html', 'x'))).toBe('clipboard.html')
    expect(downloadName(text('text/rtf', 'x'))).toBe('clipboard.rtf')
    expect(downloadName(binary('image/png', [1]))).toBe('clipboard.png')
    expect(downloadName(text('web text/x-custom', 'x'))).toBe('clipboard.txt')
    expect(downloadName(binary('application/x-unknown', [1]))).toBe('clipboard.bin')
  })

  it('keeps a pasted file name', () => {
    expect(downloadName({ ...binary('application/pdf', [1]), fileName: 'report.pdf' })).toBe('report.pdf')
  })
})

describe('parseUriList', () => {
  it('drops comments and blank lines', () => {
    expect(parseUriList('# comment\r\nhttps://a.example\r\n\r\nhttps://b.example\n')).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })
})

describe('prettyJson', () => {
  it('re-indents valid JSON and rejects the rest', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyJson('{oops')).toBeNull()
  })
})

describe('hexDump', () => {
  it('prints offset, hex and an ASCII gutter', () => {
    const dump = hexDump(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))
    expect(dump).toBe(`00000000  89 50 4e 47 0d 0a${' '.repeat(30)}  .PNG..`)
  })

  it('wraps every 16 bytes', () => {
    const lines = hexDump(new Uint8Array(20)).split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1].startsWith('00000010')).toBe(true)
  })
})

describe('rtfToPlainText', () => {
  it('keeps the text and drops font and colour tables', () => {
    const rtf =
      '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red255\\green0\\blue0;}\\f0\\fs24 Hello {\\b bold} world\\par Second line}'
    expect(rtfToPlainText(rtf)).toBe('Hello bold world\nSecond line')
  })

  it('decodes escapes, hex bytes and unicode code points', () => {
    const rtf = "{\\rtf1\\ansi caf\\'e9 \\{x\\} \\u8364? \\ldblquote q\\rdblquote}"
    expect(rtfToPlainText(rtf)).toBe('café {x} € “q”')
  })

  it('skips ignorable destinations', () => {
    expect(rtfToPlainText('{\\rtf1 {\\*\\generator Word;}Body}')).toBe('Body')
  })

  it('honours \\uc for the fallback character count', () => {
    expect(rtfToPlainText("{\\rtf1\\uc2 \\u20320\\'c4\\'e3 ok}")).toBe('你 ok')
  })
})

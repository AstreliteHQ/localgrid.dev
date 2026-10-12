/** Broad buckets a clipboard MIME type falls into. Drives the badge colour,
 * icon and preview a representation gets, so a paste carrying five formats
 * reads as "plain text, HTML, RTF, image" at a glance instead of a list of
 * near-identical MIME strings. */
export type FormatFamily = 'text' | 'markup' | 'rich-text' | 'link' | 'image' | 'data' | 'file' | 'custom'

export const FAMILY_LABELS: Record<FormatFamily, string> = {
  text: 'Plain text',
  markup: 'HTML / markup',
  'rich-text': 'Rich text',
  link: 'Links',
  image: 'Image',
  data: 'Data',
  file: 'File',
  custom: 'Custom',
}

export interface ClipboardRepresentation {
  /** MIME type exactly as the browser reported it, e.g. `text/html`,
   * `image/png` or a `web application/x-foo` custom format. */
  type: string
  family: FormatFamily
  /** Size in bytes: UTF-8 length for string data, blob size for files. */
  size: number
  /** Set for string representations. */
  text: string | null
  /** Set for file and binary representations. */
  blob: Blob | null
  /** Set when the representation is a pasted file that carries a name. */
  fileName: string | null
}

const MARKUP_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml'])
const RICH_TEXT_TYPES = new Set(['text/rtf', 'application/rtf', 'text/richtext'])
const LINK_TYPES = new Set(['text/uri-list', 'text/x-moz-url', 'url', 'text/url'])
const DATA_TYPES = new Set([
  'application/json',
  'text/json',
  'text/csv',
  'text/tab-separated-values',
  'application/yaml',
  'text/yaml',
])

/** Custom formats read through the async Clipboard API carry a `web `
 * prefix (Chrome's "web custom formats"); the MIME type proper follows it. */
const WEB_CUSTOM_PREFIX = 'web '

export function formatFamily(type: string, isFile = false): FormatFamily {
  const lower = type.toLowerCase().trim()
  if (lower.startsWith(WEB_CUSTOM_PREFIX)) return 'custom'
  if (lower.startsWith('image/')) return 'image'
  if (MARKUP_TYPES.has(lower)) return 'markup'
  if (RICH_TEXT_TYPES.has(lower)) return 'rich-text'
  if (LINK_TYPES.has(lower)) return 'link'
  if (DATA_TYPES.has(lower) || lower.endsWith('+json')) return 'data'
  if (isFile) return 'file'
  if (lower === 'text/plain' || lower === 'text' || lower.startsWith('text/plain;')) return 'text'
  if (lower.startsWith('text/')) return 'text'
  return 'custom'
}

/** True for MIME types whose bytes are readable text, so the async
 * Clipboard API path can decode them instead of treating them as binary. */
export function isTextualType(type: string): boolean {
  const lower = type.toLowerCase().replace(WEB_CUSTOM_PREFIX, '')
  return (
    lower.startsWith('text/') ||
    lower.endsWith('+json') ||
    lower.endsWith('+xml') ||
    /^application\/(json|xml|xhtml\+xml|rtf|yaml|javascript)$/.test(lower)
  )
}

export function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function textRepresentation(type: string, text: string): ClipboardRepresentation {
  return { type, family: formatFamily(type), size: textByteLength(text), text, blob: null, fileName: null }
}

function fileRepresentation(file: File | Blob, type: string): ClipboardRepresentation {
  const name = 'name' in file && file.name ? file.name : null
  return {
    type: type || 'application/octet-stream',
    family: formatFamily(type, true),
    size: file.size,
    text: null,
    blob: file,
    fileName: name,
  }
}

/** Minimal slice of `DataTransfer` the paste path reads, so tests can hand
 * in a plain object instead of a real event payload. */
export interface DataTransferLike {
  types: ReadonlyArray<string>
  getData: (type: string) => string
  files?: ArrayLike<File> | null
}

/** Reads every representation out of a `paste` event's `clipboardData`.
 * Must run synchronously inside the event handler: the browser empties the
 * DataTransfer as soon as the handler returns. `Files` is the browser's
 * marker for "there are files", not a format, so files are read from
 * `files` instead. Empty strings are formats the browser announced but
 * withheld (it does this for some app-specific types), so they are skipped. */
export function readDataTransfer(data: DataTransferLike): ClipboardRepresentation[] {
  const representations: ClipboardRepresentation[] = []
  for (const type of Array.from(data.types)) {
    if (type === 'Files') continue
    const text = data.getData(type)
    if (text === '') continue
    representations.push(textRepresentation(type, text))
  }
  const files = data.files ? Array.from(data.files) : []
  for (const file of files) representations.push(fileRepresentation(file, file.type))
  return representations
}

/** Minimal slice of `ClipboardItem` the async read path needs. */
export interface ClipboardItemLike {
  types: ReadonlyArray<string>
  getType: (type: string) => Promise<Blob>
}

/** Reads every representation from `navigator.clipboard.read()` output. */
export async function readClipboardItems(items: ReadonlyArray<ClipboardItemLike>): Promise<ClipboardRepresentation[]> {
  const representations: ClipboardRepresentation[] = []
  for (const item of items) {
    for (const type of item.types) {
      let blob: Blob
      try {
        blob = await item.getType(type)
      } catch {
        // One unreadable format shouldn't cost the others.
        continue
      }
      if (isTextualType(type)) {
        representations.push(textRepresentation(type, await blob.text()))
      } else {
        representations.push(fileRepresentation(blob, type))
      }
    }
  }
  return representations
}

/** Formats `navigator.clipboard.write` accepts on every browser that has
 * it. Anything else is checked with `ClipboardItem.supports` when the
 * browser offers it. */
const UNIVERSALLY_WRITABLE = new Set(['text/plain', 'text/html', 'image/png'])

export type CopyMode = 'native' | 'as-text' | 'none'

/** What the current browser can write back to the clipboard. */
export interface ClipboardWriteSupport {
  /** `navigator.clipboard.write` with `ClipboardItem` is available. */
  items: boolean
  /** `ClipboardItem.supports`, when the browser has it. */
  supports: ((type: string) => boolean) | null
}

export function clipboardWriteSupport(): ClipboardWriteSupport {
  const items =
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  if (!items) return { items, supports: null }
  const supports = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports
  if (typeof supports !== 'function') return { items, supports: null }
  return {
    items,
    supports: (type) => {
      try {
        return supports.call(ClipboardItem, type)
      } catch {
        return false
      }
    },
  }
}

/** How a single representation can go back on the clipboard: on its own
 * under its real MIME type (`native`), downgraded to plain text because the
 * browser refuses to write that type (`as-text`), or not at all (`none`,
 * e.g. a JPEG, which no browser accepts). */
export function copyMode(
  representation: ClipboardRepresentation,
  support: ClipboardWriteSupport = clipboardWriteSupport(),
): CopyMode {
  const { type, text } = representation
  if (support.items && (UNIVERSALLY_WRITABLE.has(type) || (support.supports?.(type) ?? false))) return 'native'
  if (text !== null) return 'as-text'
  return 'none'
}

/** Puts one representation back on the clipboard, alone. */
export async function copyRepresentation(representation: ClipboardRepresentation): Promise<CopyMode> {
  const mode = copyMode(representation)
  if (mode === 'native') {
    const blob = representation.blob ?? new Blob([representation.text ?? ''], { type: representation.type })
    await navigator.clipboard.write([new ClipboardItem({ [representation.type]: blob })])
  } else if (mode === 'as-text') {
    await navigator.clipboard.writeText(representation.text ?? '')
  }
  return mode
}

const EXTENSIONS: Record<string, string> = {
  'text/plain': 'txt',
  'text/html': 'html',
  'application/xhtml+xml': 'xhtml',
  'text/xml': 'xml',
  'application/xml': 'xml',
  'text/rtf': 'rtf',
  'application/rtf': 'rtf',
  'text/uri-list': 'uri',
  'application/json': 'json',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

/** File name for downloading a single representation. Pasted files keep
 * their own name. */
export function downloadName(representation: ClipboardRepresentation): string {
  if (representation.fileName) return representation.fileName
  const bare = representation.type.toLowerCase().replace(WEB_CUSTOM_PREFIX, '').split(';')[0].trim()
  const extension = EXTENSIONS[bare] ?? (representation.text !== null ? 'txt' : 'bin')
  return `clipboard.${extension}`
}

/** Splits a `text/uri-list` payload into its URLs, dropping `#` comment
 * lines as RFC 2483 describes. */
export function parseUriList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/** True when pasted HTML references remote resources, which the preview
 * blocks, so the widget can say why some images are missing. */
export function hasRemoteResources(html: string): boolean {
  return /(?:src|srcset)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\//i.test(html)
}

/** Re-indents JSON for the preview, or `null` when it doesn't parse. */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

/** Classic 16-bytes-per-row hex dump with an ASCII gutter, for previewing
 * binary representations. */
export function hexDump(bytes: Uint8Array): string {
  const rows: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.subarray(offset, offset + 16)
    const hex = Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
    const ascii = Array.from(chunk, (byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join('')
    rows.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`)
  }
  return rows.join('\n')
}

// RTF destinations whose content is metadata, not document text.
const SKIPPED_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'header',
  'footer',
  'headerl',
  'headerr',
  'footerl',
  'footerr',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'xmlnstbl',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'generator',
  'filetbl',
  'revtbl',
  'object',
])

const SYMBOL_WORDS: Record<string, string> = {
  par: '\n',
  line: '\n',
  row: '\n',
  sect: '\n',
  page: '\n',
  tab: '\t',
  cell: '\t',
  emdash: '—',
  endash: '–',
  bullet: '•',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  emspace: ' ',
  enspace: ' ',
}

const CONTROL_WORD = /([a-zA-Z]+)(-?\d+)? ?/y

function decodeAnsiByte(byte: number): string {
  try {
    return new TextDecoder('windows-1252').decode(Uint8Array.of(byte))
  } catch {
    return String.fromCharCode(byte)
  }
}

/** Extracts readable text from an RTF document. Browsers can't render RTF,
 * so this is the preview for `text/rtf`: groups, font and colour tables and
 * other metadata destinations are dropped, escapes and `\u` code points are
 * decoded. Formatting is lost on purpose; the raw view still has it. */
export function rtfToPlainText(rtf: string): string {
  let output = ''
  const stack: Array<{ skip: boolean; unicodeSkip: number }> = []
  let skip = false
  let unicodeSkip = 1
  let pendingFallbackChars = 0

  const emit = (text: string) => {
    if (skip) return
    if (pendingFallbackChars > 0) {
      pendingFallbackChars -= 1
      return
    }
    output += text
  }

  let index = 0
  while (index < rtf.length) {
    const char = rtf[index]
    if (char === '{') {
      stack.push({ skip, unicodeSkip })
      index += 1
      continue
    }
    if (char === '}') {
      const previous = stack.pop()
      if (previous) ({ skip, unicodeSkip } = previous)
      pendingFallbackChars = 0
      index += 1
      continue
    }
    if (char === '\r' || char === '\n') {
      index += 1
      continue
    }
    if (char !== '\\') {
      emit(char)
      index += 1
      continue
    }

    const next = rtf[index + 1]
    if (next === undefined) break
    if (next === '\\' || next === '{' || next === '}') {
      emit(next)
      index += 2
      continue
    }
    if (next === "'") {
      const byte = Number.parseInt(rtf.slice(index + 2, index + 4), 16)
      if (!Number.isNaN(byte)) emit(decodeAnsiByte(byte))
      index += 4
      continue
    }
    if (next === '*') {
      skip = true
      index += 2
      continue
    }
    if (next === '\n' || next === '\r') {
      emit('\n')
      index += 2
      continue
    }
    if (next === '~') {
      emit(' ')
      index += 2
      continue
    }
    if (next === '_') {
      emit('-')
      index += 2
      continue
    }

    CONTROL_WORD.lastIndex = index + 1
    const match = CONTROL_WORD.exec(rtf)
    if (!match) {
      // Any other control symbol (`\-`, `\:`, `\|`) has no text of its own.
      index += 2
      continue
    }
    index = CONTROL_WORD.lastIndex
    const word = match[1]
    const param = match[2] === undefined ? null : Number(match[2])

    if (SKIPPED_DESTINATIONS.has(word)) {
      skip = true
    } else if (word === 'uc') {
      unicodeSkip = param ?? 1
    } else if (word === 'u' && param !== null) {
      emit(String.fromCharCode(param < 0 ? param + 65536 : param))
      pendingFallbackChars = unicodeSkip
    } else if (word in SYMBOL_WORDS) {
      emit(SYMBOL_WORDS[word])
    }
  }

  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Turns links in pasted HTML into plain text that keeps its URL as a
 * tooltip. The sandbox and CSP already stop scripts and network loads, but
 * a click on a link would still navigate the preview frame itself to the
 * linked site. `DOMParser` output is inert: nothing in it runs or loads. */
export function disarmLinks(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const link of Array.from(doc.querySelectorAll('a[href], area[href]'))) {
    const href = link.getAttribute('href') ?? ''
    link.removeAttribute('href')
    if (!link.hasAttribute('title')) link.setAttribute('title', href)
  }
  return doc.head.innerHTML + doc.body.innerHTML
}

/** Wraps pasted HTML for the sandboxed preview frame. The CSP keeps the
 * snippet from loading anything over the network (scripts, fonts, frames,
 * and remote images, which are often tracking pixels in pasted email), so
 * inspecting a paste never contacts a third party. Inline styles and
 * embedded `data:` images still render, and links are disarmed so a click
 * can't navigate the frame away either. */
export function htmlPreviewDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"><style>body{margin:8px;font:13px/1.45 system-ui,sans-serif;color:#111;background:#fff}img{max-width:100%;height:auto}a{color:#2563eb;text-decoration:underline;cursor:help}</style></head><body>${disarmLinks(html)}</body></html>`
}

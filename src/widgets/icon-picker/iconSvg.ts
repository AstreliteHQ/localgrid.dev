/** Pure helpers for the Icon Picker: search, SVG export markup, and file
 * names. Kept free of the Lucide icon set itself so they load (and test)
 * without pulling in the ~1,900 icon modules. */

export interface IconStyle {
  color: string
  strokeWidth: number
  /** Output width and height, in px. */
  size: number
  /** Empty space around the icon on each side, in px of the output. */
  padding: number
}

export const MIN_SIZE = 8
export const MAX_SIZE = 1024
export const MIN_STROKE = 0.25
export const MAX_STROKE = 4

/** Lucide export keys are PascalCase (`ArrowDownAZ`, `Grid2x2Check`). This
 * gives the readable kebab name for labels. It matches Lucide's own file
 * names except for a few with two-digit runs (`ArrowDown01` reads
 * `arrow-down-01`, Lucide says `arrow-down-0-1`), which is fine for a label;
 * the exact name, when it matters (file names), comes from the rendered
 * icon's class instead. */
export function toKebabName(pascal: string): string {
  return pascal
    .replace(/([A-Za-z0-9])(?=[A-Z])/g, '$1-')
    .replace(/(?<!\d)([a-zA-Z])(?=\d)/g, '$1-')
    .toLowerCase()
}

/** Squashes a name or query to lowercase letters and digits, so `arrow
 * down`, `arrow-down`, `ArrowDown` and `arrowdown` all compare equal. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Filters icon keys by a free text query. Every space separated term must
 * appear in the name; exact matches come first, then prefix matches, then
 * the rest, each group in alphabetical order. An empty query returns every
 * key. */
export function searchIcons(keys: readonly string[], query: string): string[] {
  const terms = query
    .split(/[\s,]+/)
    .map(squash)
    .filter(Boolean)
  if (terms.length === 0) return [...keys]
  const whole = terms.join('')
  const ranked: { key: string; rank: number }[] = []
  for (const key of keys) {
    const name = squash(key)
    if (!terms.every((term) => name.includes(term))) continue
    const rank = name === whole ? 0 : name.startsWith(terms[0]) ? 1 : 2
    ranked.push({ key, rank })
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key)).map(({ key }) => key)
}

/** Keeps at least 1px of the output for the icon itself. */
export function clampPadding(size: number, padding: number): number {
  return Math.max(0, Math.min(padding, Math.floor((size - 1) / 2)))
}

function round(value: number): string {
  return String(Number(value.toFixed(3)))
}

/** Lucide renders every child as an empty element (`<path d=".."></path>`);
 * this puts each on its own self-closing line for readable SVG code. */
function formatChildren(markup: string): string {
  const selfClosed = markup.replace(/<([a-z]+)([^<>]*)><\/\1>/g, '<$1$2 />')
  return selfClosed
    .split(/(?<=>)\s*(?=<)/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `  ${line}`)
    .join('\n')
}

/** Standalone SVG for one icon. `markup` is the icon's inner elements and
 * `viewBox` the icon's own box (Lucide's are 24 x 24). Padding widens the
 * viewBox rather than wrapping the paths in a transform, so the code stays
 * as close to Lucide's as possible. The stroke width is in icon units, like
 * Lucide's `strokeWidth` prop, so it scales with the icon. */
export function buildIconSvg(markup: string, style: IconStyle, viewBox = '0 0 24 24'): string {
  const [x = 0, y = 0, w = 24, h = 24] = viewBox.split(/[\s,]+/).map(Number)
  const size = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, style.size)))
  const padding = clampPadding(size, Math.round(style.padding))
  // Icon units per output px, measured on the icon's longer side.
  const unit = Math.max(w, h) / (size - 2 * padding)
  const pad = padding * unit
  const box = [x - pad, y - pad, w + 2 * pad, h + 2 * pad].map(round).join(' ')
  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `width="${size}"`,
    `height="${size}"`,
    `viewBox="${box}"`,
    'fill="none"',
    `stroke="${style.color}"`,
    `stroke-width="${round(style.strokeWidth)}"`,
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ]
  return `<svg ${attributes.join(' ')}>\n${formatChildren(markup)}\n</svg>\n`
}

/** File-system friendly base name for downloads. */
export function iconFileName(name: string, extension: 'svg' | 'png'): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'icon'
  return `${base}.${extension}`
}

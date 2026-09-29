/** Canvas-backed rendering of tokenized code into a downloadable/copyable
 * "snippet card" PNG — a rounded, padded card in the chosen theme, sized to
 * fit the code exactly. No DOM/editor involved: `tokenizeCode.ts` already
 * reduced the source to plain styled runs, so this only has to lay out and
 * draw text. */

import type { Token } from './tokenizeCode'
import type { SnippetTheme } from './snippetThemes'

export interface RenderOptions {
  theme: SnippetTheme
  /** Base font size in CSS px; line height and padding scale with it. */
  fontSize: number
}

// A generic monospace stack rather than pinning to the app's own
// `--font-mono` (JetBrains Mono, loaded as a webpage font) — this canvas
// draw happens synchronously and a webfont not yet loaded/painted would
// silently fall through to the browser's UA default mid-render, which
// would then mismatch the width this function itself measured a line at.
// The two named faces below are what a Windows/mac browser resolves a bare
// "monospace" to, listed explicitly so layout is stable either way.
const FONT_FAMILY = '"Cascadia Code", "SF Mono", Consolas, monospace'
const LINE_HEIGHT_RATIO = 1.6
const CARD_RADIUS = 12
// 2x the CSS pixel size the layout is computed at, so the exported PNG
// stays crisp on a HiDPI display instead of looking like a browser
// zoomed-in screenshot.
const EXPORT_SCALE = 2

function fontString(fontSize: number, style: { italic?: boolean; bold?: boolean } | undefined): string {
  return `${style?.italic ? 'italic ' : ''}${style?.bold ? 'bold ' : ''}${fontSize}px ${FONT_FAMILY}`
}

/** Splits tokens into lines, since a single token's text can itself span
 * multiple lines (a block comment, a template string, a Markdown
 * paragraph) — drawing has to happen one line at a time regardless. */
function splitIntoLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]]
  for (const token of tokens) {
    const parts = token.text.split('\n')
    parts.forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ text: part, category: token.category })
    })
  }
  return lines
}

export interface SnippetImage {
  blob: Blob
  /** The card's *display* size in CSS px — `canvas.width`/`height` divided
   * back out of `EXPORT_SCALE` — so a caller can show the PNG at the size
   * it actually reads as, rather than at its doubled pixel-buffer size. */
  width: number
  height: number
}

/** Renders `tokens` as a themed snippet card and resolves a PNG `Blob`.
 * Rejects if the browser can't give a 2D canvas context or can't encode
 * PNG (both effectively never happen in a real browser). */
export async function renderSnippetImage(tokens: Token[], options: RenderOptions): Promise<SnippetImage> {
  const { theme, fontSize } = options
  const lineHeight = fontSize * LINE_HEIGHT_RATIO
  const padding = fontSize
  const lines = splitIntoLines(tokens)

  const measurer = document.createElement('canvas').getContext('2d')
  if (!measurer) throw new Error('This browser does not support canvas rendering.')
  let contentWidth = 0
  for (const line of lines) {
    let width = 0
    for (const token of line) {
      measurer.font = fontString(fontSize, token.category ? theme.categories[token.category] : undefined)
      width += measurer.measureText(token.text).width
    }
    contentWidth = Math.max(contentWidth, width)
  }
  // A blank line (or entirely empty input) would otherwise collapse the
  // card to zero width.
  contentWidth = Math.max(contentWidth, fontSize * 4)

  const width = Math.ceil(contentWidth) + padding * 2
  const height = Math.ceil(Math.max(lines.length, 1) * lineHeight) + padding * 2

  const canvas = document.createElement('canvas')
  canvas.width = width * EXPORT_SCALE
  canvas.height = height * EXPORT_SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser does not support canvas rendering.')
  context.scale(EXPORT_SCALE, EXPORT_SCALE)

  context.fillStyle = theme.background
  context.beginPath()
  context.roundRect(0, 0, width, height, CARD_RADIUS)
  context.fill()

  context.textBaseline = 'top'
  lines.forEach((line, lineIndex) => {
    let x = padding
    const y = padding + lineIndex * lineHeight
    for (const token of line) {
      const style = token.category ? theme.categories[token.category] : undefined
      context.font = fontString(fontSize, style)
      context.fillStyle = style?.color ?? theme.foreground
      context.fillText(token.text, x, y)
      x += context.measureText(token.text).width
    }
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('This browser cannot encode PNG.'))
    }, 'image/png')
  })
  return { blob, width, height }
}

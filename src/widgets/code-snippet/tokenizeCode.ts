/** Turns source code into an ordered list of styled runs, using the given
 * language's own `@lezer/common` `Parser` plus `@lezer/highlight`'s
 * `highlightTree` — the same machinery `@codemirror/language`'s
 * `syntaxHighlighting` extension uses internally, just walked here into a
 * plain array instead of CodeMirror decorations, so `renderSnippetImage.ts`
 * can draw it onto a canvas with no DOM/editor involved. */

import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight'
import type { Parser } from '@lezer/common'

/** Coarse enough to give every supported language (and Markdown's prose
 * markup, which needs its own categories entirely) a sensible color without
 * a category per language construct. `snippetThemes.ts` is the other half
 * of this contract — every value here should have an entry there. */
export type TokenCategory =
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'function'
  | 'type'
  | 'property'
  | 'variable'
  | 'tag'
  | 'attribute'
  | 'punctuation'
  | 'meta'
  | 'heading'
  | 'strong'
  | 'emphasis'
  | 'link'
  | 'url'
  | 'code'
  | 'quote'
  | 'list'

export interface Token {
  text: string
  /** `null` for a run `highlightTree` assigned no style to (whitespace,
   * unstyled punctuation) — rendered in the theme's plain foreground color. */
  category: TokenCategory | null
}

// A tag can match more than one rule below (rare, and only among the
// "modifier" combinations like `function(variableName)`); `tagHighlighter`
// then joins their classes with a space, and only the first is used as the
// run's category — rule order therefore doubles as a priority order.
const HIGHLIGHTER = tagHighlighter([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'comment' },
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.self, t.bool, t.null, t.atom],
    class: 'keyword',
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape], class: 'string' },
  { tag: [t.number, t.integer, t.float], class: 'number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: 'function' },
  { tag: [t.typeName, t.className, t.namespace], class: 'type' },
  { tag: t.propertyName, class: 'property' },
  { tag: [t.variableName, t.definition(t.variableName), t.definition(t.propertyName)], class: 'variable' },
  { tag: t.tagName, class: 'tag' },
  { tag: t.attributeName, class: 'attribute' },
  {
    tag: [t.operator, t.punctuation, t.bracket, t.derefOperator, t.separator, t.definitionOperator],
    class: 'punctuation',
  },
  { tag: [t.meta, t.processingInstruction], class: 'meta' },
  { tag: t.heading, class: 'heading' },
  { tag: t.strong, class: 'strong' },
  { tag: t.emphasis, class: 'emphasis' },
  { tag: t.link, class: 'link' },
  { tag: t.url, class: 'url' },
  { tag: t.monospace, class: 'code' },
  { tag: t.quote, class: 'quote' },
  { tag: t.list, class: 'list' },
])

/** `parser` is `null` for plain text (or a language `loadParser` couldn't
 * resolve) — the whole input then comes back as one uncategorized run. */
export function tokenizeCode(code: string, parser: Parser | null): Token[] {
  if (!code) return []
  if (!parser) return [{ text: code, category: null }]

  const tree = parser.parse(code)
  const tokens: Token[] = []
  let cursor = 0
  highlightTree(tree, HIGHLIGHTER, (from, to, classes) => {
    if (from > cursor) tokens.push({ text: code.slice(cursor, from), category: null })
    const category = (classes.split(' ')[0] as TokenCategory | undefined) ?? null
    tokens.push({ text: code.slice(from, to), category })
    cursor = to
  })
  if (cursor < code.length) tokens.push({ text: code.slice(cursor), category: null })
  return tokens
}

/** The Code Snippet widget's language catalog, and a per-language loader.
 * Each language's CodeMirror grammar package is imported dynamically, on
 * demand — with 15 languages to choose from, bundling every grammar up
 * front into this already-lazy widget's own chunk would still pull in far
 * more than any one snippet ever needs. */

import type { Extension } from '@codemirror/state'
import type { Parser } from '@lezer/common'

export interface LanguageOption {
  id: string
  label: string
}

/** `'plaintext'` first (the safe, always-available fallback), the rest
 * alphabetically by label. */
export const LANGUAGES: LanguageOption[] = [
  { id: 'plaintext', label: 'Plain text' },
  { id: 'cpp', label: 'C / C++' },
  { id: 'css', label: 'CSS' },
  { id: 'go', label: 'Go' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript / TypeScript' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'php', label: 'PHP' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
]

export interface LoadedLanguage {
  /** Usable directly as a CodeMirror `extraExtensions` entry, for the
   * widget's own (live, editable) code input. */
  extension: Extension
  /** The bare `@lezer/common` `Parser` behind that extension — the one
   * piece `tokenizeCode` needs for the separate, DOM-free tokenization the
   * exported image is built from. */
  parser: Parser
}

/** Resolves a language id to both the CodeMirror extension that gives the
 * live editor its highlighting and the raw parser `tokenizeCode` walks for
 * the exported image — one dynamic import serves both, rather than
 * fetching the same package twice. Returns `null` for `'plaintext'` (and
 * any unrecognized id): the editor then falls back to line-wrapped plain
 * text, and `tokenizeCode` renders the whole input as one unstyled run. */
export async function loadLanguage(languageId: string): Promise<LoadedLanguage | null> {
  switch (languageId) {
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript')
      const support = javascript({ typescript: true })
      return { extension: support, parser: support.language.parser }
    }
    case 'python': {
      const { python } = await import('@codemirror/lang-python')
      const support = python()
      return { extension: support, parser: support.language.parser }
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json')
      const support = json()
      return { extension: support, parser: support.language.parser }
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html')
      const support = html()
      return { extension: support, parser: support.language.parser }
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css')
      const support = css()
      return { extension: support, parser: support.language.parser }
    }
    case 'java': {
      const { java } = await import('@codemirror/lang-java')
      const support = java()
      return { extension: support, parser: support.language.parser }
    }
    case 'cpp': {
      const { cpp } = await import('@codemirror/lang-cpp')
      const support = cpp()
      return { extension: support, parser: support.language.parser }
    }
    case 'go': {
      const { go } = await import('@codemirror/lang-go')
      const support = go()
      return { extension: support, parser: support.language.parser }
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust')
      const support = rust()
      return { extension: support, parser: support.language.parser }
    }
    case 'sql': {
      const { sql } = await import('@codemirror/lang-sql')
      const support = sql()
      return { extension: support, parser: support.language.parser }
    }
    case 'php': {
      const { php } = await import('@codemirror/lang-php')
      const support = php()
      return { extension: support, parser: support.language.parser }
    }
    case 'yaml': {
      const { yaml } = await import('@codemirror/lang-yaml')
      const support = yaml()
      return { extension: support, parser: support.language.parser }
    }
    case 'markdown': {
      const { markdown } = await import('@codemirror/lang-markdown')
      const support = markdown()
      return { extension: support, parser: support.language.parser }
    }
    case 'xml': {
      const { xml } = await import('@codemirror/lang-xml')
      const support = xml()
      return { extension: support, parser: support.language.parser }
    }
    case 'shell': {
      const [{ StreamLanguage }, { shell }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/shell'),
      ])
      const language = StreamLanguage.define(shell)
      return { extension: language, parser: language.parser }
    }
    default:
      return null
  }
}

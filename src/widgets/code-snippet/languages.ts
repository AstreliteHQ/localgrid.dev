/** The Code Snippet widget's language catalog, and a per-language parser
 * loader. Each language's CodeMirror grammar package is imported
 * dynamically, on demand — with 15 languages to choose from, bundling every
 * grammar up front into this already-lazy widget's own chunk would still
 * pull in far more than any one snippet ever needs. */

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

/** Resolves a language id to the `@lezer/common` `Parser` behind it — the
 * one piece `tokenizeCode` actually needs, out of everything a full
 * `LanguageSupport` (autocomplete, indentation, folding…) carries. Returns
 * `null` for `'plaintext'` (and any unrecognized id), which `tokenizeCode`
 * treats as "render as one unstyled run". */
export async function loadParser(languageId: string): Promise<Parser | null> {
  switch (languageId) {
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript')
      return javascript({ typescript: true }).language.parser
    }
    case 'python': {
      const { python } = await import('@codemirror/lang-python')
      return python().language.parser
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json')
      return json().language.parser
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html')
      return html().language.parser
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css')
      return css().language.parser
    }
    case 'java': {
      const { java } = await import('@codemirror/lang-java')
      return java().language.parser
    }
    case 'cpp': {
      const { cpp } = await import('@codemirror/lang-cpp')
      return cpp().language.parser
    }
    case 'go': {
      const { go } = await import('@codemirror/lang-go')
      return go().language.parser
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust')
      return rust().language.parser
    }
    case 'sql': {
      const { sql } = await import('@codemirror/lang-sql')
      return sql().language.parser
    }
    case 'php': {
      const { php } = await import('@codemirror/lang-php')
      return php().language.parser
    }
    case 'yaml': {
      const { yaml } = await import('@codemirror/lang-yaml')
      return yaml().language.parser
    }
    case 'markdown': {
      const { markdown } = await import('@codemirror/lang-markdown')
      return markdown().language.parser
    }
    case 'xml': {
      const { xml } = await import('@codemirror/lang-xml')
      return xml().language.parser
    }
    case 'shell': {
      const [{ StreamLanguage }, { shell }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/shell'),
      ])
      return StreamLanguage.define(shell).parser
    }
    default:
      return null
  }
}

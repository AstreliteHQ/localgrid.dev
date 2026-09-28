/** Color themes for the exported snippet image — deliberately independent
 * of the app's own light/dark mode (`useThemeStore`): a code screenshot
 * meant to be pasted into a Word doc or a slide is judged on its own, next
 * to whatever else is on that page, not against the dashboard it was made
 * in. `id`/`label` are what the widget's theme picker shows. */

import type { TokenCategory } from './tokenizeCode'

export interface CategoryStyle {
  color: string
  italic?: boolean
  bold?: boolean
}

export interface SnippetTheme {
  id: 'dark' | 'light'
  label: string
  background: string
  /** Plain/uncategorized text, and the fallback for any category below
   * that doesn't set its own color (none currently do, but keeps
   * `categories` safe to use as a `Partial`). */
  foreground: string
  categories: Partial<Record<TokenCategory, CategoryStyle>>
}

export const SNIPPET_THEMES: Record<'dark' | 'light', SnippetTheme> = {
  dark: {
    id: 'dark',
    label: 'Dark',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    categories: {
      comment: { color: '#6c7086', italic: true },
      keyword: { color: '#cba6f7' },
      string: { color: '#a6e3a1' },
      number: { color: '#fab387' },
      function: { color: '#89b4fa' },
      type: { color: '#f9e2af' },
      property: { color: '#89dceb' },
      variable: { color: '#cdd6f4' },
      tag: { color: '#f38ba8' },
      attribute: { color: '#fab387' },
      punctuation: { color: '#9399b2' },
      meta: { color: '#9399b2' },
      heading: { color: '#89b4fa', bold: true },
      strong: { color: '#cdd6f4', bold: true },
      emphasis: { color: '#cdd6f4', italic: true },
      link: { color: '#89b4fa' },
      url: { color: '#a6e3a1' },
      code: { color: '#a6e3a1' },
      quote: { color: '#6c7086', italic: true },
      list: { color: '#f9e2af' },
    },
  },
  light: {
    id: 'light',
    label: 'Light',
    background: '#ffffff',
    foreground: '#24292f',
    categories: {
      comment: { color: '#6e7781', italic: true },
      keyword: { color: '#cf222e' },
      string: { color: '#0a3069' },
      number: { color: '#0550ae' },
      function: { color: '#8250df' },
      type: { color: '#953800' },
      property: { color: '#0550ae' },
      variable: { color: '#24292f' },
      tag: { color: '#116329' },
      attribute: { color: '#953800' },
      punctuation: { color: '#57606a' },
      meta: { color: '#57606a' },
      heading: { color: '#0550ae', bold: true },
      strong: { color: '#24292f', bold: true },
      emphasis: { color: '#24292f', italic: true },
      link: { color: '#0550ae' },
      url: { color: '#0a3069' },
      code: { color: '#0a3069' },
      quote: { color: '#6e7781', italic: true },
      list: { color: '#953800' },
    },
  },
}

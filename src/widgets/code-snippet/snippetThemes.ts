/** Color themes for the exported snippet image — deliberately independent
 * of the app's own light/dark mode (`useThemeStore`): a code screenshot
 * meant to be pasted into a Word doc or a slide is judged on its own, next
 * to whatever else is on that page, not against the dashboard it was made
 * in. `id`/`label` are what the widget's theme picker shows. */

import type { TokenCategory } from './tokenizeCode'

export type SnippetThemeId = 'dark' | 'light' | 'dracula' | 'nord' | 'monokai' | 'solarized-light'

export interface CategoryStyle {
  color: string
  italic?: boolean
  bold?: boolean
}

export interface SnippetTheme {
  id: SnippetThemeId
  label: string
  background: string
  /** Plain/uncategorized text, and the fallback for any category below
   * that doesn't set its own color (none currently do, but keeps
   * `categories` safe to use as a `Partial`). */
  foreground: string
  /** Background band painted behind a highlighted line — a translucent
   * `rgba(...)`, tuned per theme rather than derived, so it reads as an
   * intentional accent rather than a generic overlay on every background. */
  highlightBackground: string
  categories: Partial<Record<TokenCategory, CategoryStyle>>
}

/** Display order for the theme picker — not alphabetical, dark themes
 * first since that's the more common choice for a code screenshot. */
export const SNIPPET_THEME_ORDER: SnippetThemeId[] = ['dark', 'dracula', 'nord', 'monokai', 'light', 'solarized-light']

export const SNIPPET_THEMES: Record<SnippetThemeId, SnippetTheme> = {
  dark: {
    id: 'dark',
    label: 'Dark',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    highlightBackground: 'rgba(137, 180, 250, 0.12)',
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
    highlightBackground: 'rgba(9, 105, 218, 0.08)',
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
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    highlightBackground: 'rgba(189, 147, 249, 0.15)',
    categories: {
      comment: { color: '#6272a4', italic: true },
      keyword: { color: '#ff79c6' },
      string: { color: '#f1fa8c' },
      number: { color: '#bd93f9' },
      function: { color: '#50fa7b' },
      type: { color: '#8be9fd' },
      property: { color: '#8be9fd' },
      variable: { color: '#f8f8f2' },
      tag: { color: '#ff79c6' },
      attribute: { color: '#50fa7b' },
      punctuation: { color: '#f8f8f2' },
      meta: { color: '#6272a4' },
      heading: { color: '#bd93f9', bold: true },
      strong: { color: '#f8f8f2', bold: true },
      emphasis: { color: '#f8f8f2', italic: true },
      link: { color: '#8be9fd' },
      url: { color: '#f1fa8c' },
      code: { color: '#f1fa8c' },
      quote: { color: '#6272a4', italic: true },
      list: { color: '#ffb86c' },
    },
  },
  nord: {
    id: 'nord',
    label: 'Nord',
    background: '#2e3440',
    foreground: '#d8dee9',
    highlightBackground: 'rgba(136, 192, 208, 0.14)',
    categories: {
      comment: { color: '#4c566a', italic: true },
      keyword: { color: '#81a1c1' },
      string: { color: '#a3be8c' },
      number: { color: '#b48ead' },
      function: { color: '#88c0d0' },
      type: { color: '#8fbcbb' },
      property: { color: '#8fbcbb' },
      variable: { color: '#d8dee9' },
      tag: { color: '#81a1c1' },
      attribute: { color: '#88c0d0' },
      punctuation: { color: '#4c566a' },
      meta: { color: '#4c566a' },
      heading: { color: '#88c0d0', bold: true },
      strong: { color: '#d8dee9', bold: true },
      emphasis: { color: '#d8dee9', italic: true },
      link: { color: '#88c0d0' },
      url: { color: '#a3be8c' },
      code: { color: '#a3be8c' },
      quote: { color: '#4c566a', italic: true },
      list: { color: '#8fbcbb' },
    },
  },
  monokai: {
    id: 'monokai',
    label: 'Monokai',
    background: '#272822',
    foreground: '#f8f8f2',
    highlightBackground: 'rgba(249, 38, 114, 0.10)',
    categories: {
      comment: { color: '#75715e', italic: true },
      keyword: { color: '#f92672' },
      string: { color: '#e6db74' },
      number: { color: '#ae81ff' },
      function: { color: '#a6e22e' },
      type: { color: '#66d9ef' },
      property: { color: '#66d9ef' },
      variable: { color: '#f8f8f2' },
      tag: { color: '#f92672' },
      attribute: { color: '#a6e22e' },
      punctuation: { color: '#f8f8f2' },
      meta: { color: '#75715e' },
      heading: { color: '#66d9ef', bold: true },
      strong: { color: '#f8f8f2', bold: true },
      emphasis: { color: '#f8f8f2', italic: true },
      link: { color: '#66d9ef' },
      url: { color: '#e6db74' },
      code: { color: '#e6db74' },
      quote: { color: '#75715e', italic: true },
      list: { color: '#fd971f' },
    },
  },
  'solarized-light': {
    id: 'solarized-light',
    label: 'Solarized Light',
    background: '#fdf6e3',
    foreground: '#657b83',
    highlightBackground: 'rgba(38, 139, 210, 0.08)',
    categories: {
      comment: { color: '#93a1a1', italic: true },
      keyword: { color: '#859900' },
      string: { color: '#2aa198' },
      number: { color: '#d33682' },
      function: { color: '#268bd2' },
      type: { color: '#b58900' },
      property: { color: '#268bd2' },
      variable: { color: '#657b83' },
      tag: { color: '#268bd2' },
      attribute: { color: '#2aa198' },
      punctuation: { color: '#93a1a1' },
      meta: { color: '#93a1a1' },
      heading: { color: '#268bd2', bold: true },
      strong: { color: '#657b83', bold: true },
      emphasis: { color: '#657b83', italic: true },
      link: { color: '#268bd2' },
      url: { color: '#2aa198' },
      code: { color: '#2aa198' },
      quote: { color: '#93a1a1', italic: true },
      list: { color: '#b58900' },
    },
  },
}

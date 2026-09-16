import { forwardRef, useMemo, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { javascript } from '@codemirror/lang-javascript'
import { Prec, type Extension } from '@codemirror/state'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsDarkTheme } from '@/theme/useThemeStore'
import { cn } from '@/lib/utils'

export type CodeEditorLanguage = 'json' | 'xml' | 'javascript' | 'plaintext'

const LANGUAGE_EXTENSIONS: Record<CodeEditorLanguage, () => Extension[]> = {
  json: () => [json()],
  xml: () => [xml()],
  // TypeScript rather than plain JS: the grammar is a superset, so a .ts
  // snippet keeps its highlighting and a .js one loses nothing.
  javascript: () => [javascript({ typescript: true })],
  // No language grammar to highlight — just wrap long lines instead of
  // scrolling horizontally, which matters far more for prose than for the
  // structured/single-line inputs the other widgets edit.
  plaintext: () => [EditorView.lineWrapping],
}

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: CodeEditorLanguage
  readOnly?: boolean
  placeholder?: string
  className?: string
  /** CodeMirror's placeholder isn't a real `placeholder` DOM attribute
   * (getByPlaceholderText won't match it), and the editor has no visible
   * <label>, so give it an accessible name directly — also doubles as the
   * query hook tests use via getByRole('textbox', { name }). */
  'aria-label'?: string
  /** Escape hatch for a widget-specific extension (e.g. log-viewer's
   * regex-based pattern highlighting) that doesn't belong in the shared
   * `LANGUAGE_EXTENSIONS` map above since only one widget needs it. Appended
   * after the language extensions, so it can freely add its own decorations
   * without needing to know what `language` resolved to. */
  extraExtensions?: Extension[]
}

/** Built from the same CSS custom properties index.css defines (via
 * `var(--color-*)`), not a prebuilt theme package, so it stays visually
 * consistent with the rest of the app and follows the existing `.dark`
 * class toggle automatically — no separate light/dark palette to maintain
 * here. `isDark` only affects CodeMirror's own internal `dark` scoping
 * flag (e.g. selection contrast defaults); the actual colors always come
 * from the CSS vars, which already flip via the `.dark` class on <html>. */
// Exported for reuse by MergeDiffView.tsx (text-diff's line-mode merge
// view) — it builds its own raw CodeMirror panes rather than going through
// this component, but wants the exact same base look (font, gutters,
// selection, search panel) rather than duplicating ~170 lines of theme.
// eslint-disable-next-line react-refresh/only-export-components
export function useAppEditorTheme(isDark: boolean): Extension {
  return useMemo(() => {
    // Unlike --color-muted-foreground (a semantic token, redefined under
    // .dark in index.css), --color-blue-600 etc. are Tailwind's raw palette
    // swatches — fixed hex values that never change between themes. The
    // 600-level shades read fine on a light background but lose contrast
    // on a dark one, so pick a lighter shade per token when isDark.
    const highlightStyle = HighlightStyle.define([
      { tag: tags.propertyName, color: isDark ? 'var(--color-blue-400)' : 'var(--color-blue-600)' },
      { tag: tags.string, color: isDark ? 'var(--color-amber-400)' : 'var(--color-amber-600)' },
      { tag: tags.number, color: isDark ? 'var(--color-green-400)' : 'var(--color-green-600)' },
      { tag: tags.bool, color: isDark ? 'var(--color-purple-400)' : 'var(--color-purple-600)' },
      { tag: tags.null, color: 'var(--color-muted-foreground)' },
      { tag: tags.punctuation, color: 'var(--color-muted-foreground)' },
    ])
    const theme = EditorView.theme(
      {
        '&': {
          color: 'var(--color-foreground)',
          backgroundColor: 'transparent',
          fontSize: '0.75rem',
          height: '100%',
        },
        '.cm-content': {
          fontFamily: 'var(--font-mono)',
          caretColor: 'var(--color-foreground)',
        },
        '.cm-scroller': { fontFamily: 'var(--font-mono)' },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'var(--color-muted-foreground)',
          border: 'none',
        },
        // CodeMirror's own base theme gives `.cm-activeLine` a translucent
        // background on purpose (e.g. `#cceeff44`) because the selection
        // layer beneath it (`.cm-selectionBackground`) paints at a negative
        // z-index, behind line content, specifically so an app's active-line
        // color can still let it show through. An opaque fill here would sit
        // above that layer and hide it completely — invisible-selection bug
        // — so this has to stay translucent too via color-mix rather than a
        // flat `var(--color-muted)`.
        '.cm-activeLine, .cm-activeLineGutter': {
          backgroundColor: 'color-mix(in oklab, var(--color-muted) 60%, transparent)',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--color-foreground)',
        },
        // CodeMirror's own base theme colors selection backgrounds in three
        // separate rules — a plain one, plus a *focused* one scoped with
        // `&light`/`&dark` down through `.cm-focused > .cm-scroller >
        // .cm-selectionLayer .cm-selectionBackground`. That compound form
        // out-specifies a plain `.cm-selectionBackground` override (more
        // classes wins regardless of load order), so the focused case has
        // to be matched selector-for-selector to actually override it —
        // this is the state you see any time text is actually selected
        // with the editor focused, i.e. most of the time.
        '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: 'var(--color-ring)',
          opacity: 0.35,
        },
        // Same wash/outline treatment as .cm-selectionMatch below, but on
        // amber so search hits read as a distinct kind of highlight rather
        // than more of the same ring-blue. --color-highlight itself (amber-200
        // light / amber-500 dark) is tuned for a solid fill, not a diluted
        // mix — amber-200 mixed down further nearly disappears on white — so
        // this uses the amber-600/400 pair instead, the same contrast-tuned
        // shades the JSON string color above already uses per theme.
        '.cm-searchMatch': {
          backgroundColor: `color-mix(in oklab, var(${isDark ? '--color-amber-400' : '--color-amber-600'}) 30%, transparent)`,
          outline: `1px solid var(${isDark ? '--color-amber-400' : '--color-amber-600'})`,
          borderRadius: '2px',
        },
        '.cm-searchMatch-selected': {
          backgroundColor: `color-mix(in oklab, var(${isDark ? '--color-amber-400' : '--color-amber-600'}) 60%, transparent)`,
        },
        // Override highlightSelectionMatches' default lime-green fill
        // (#99ff7780) with a wash/outline in the same --color-ring already
        // used for the live selection, so it doesn't fight syntax colors.
        '.cm-selectionMatch': {
          backgroundColor: 'color-mix(in oklab, var(--color-ring) 20%, transparent)',
          outline: '1px solid color-mix(in oklab, var(--color-ring) 45%, transparent)',
          borderRadius: '2px',
        },
        // Same idea for bracket matching's default teal/red fill. Its base
        // rule is scoped under &.cm-focused, which out-specifies a plain
        // .cm-matchingBracket override, so match it selector-for-selector
        // like the focused selection rule above.
        '&.cm-focused .cm-matchingBracket': {
          backgroundColor: 'transparent',
          outline: '1px solid color-mix(in oklab, var(--color-foreground) 35%, transparent)',
          borderRadius: '2px',
        },
        '&.cm-focused .cm-nonmatchingBracket': {
          backgroundColor: 'transparent',
          outline: '1px solid color-mix(in oklab, var(--color-destructive) 55%, transparent)',
          borderRadius: '2px',
        },
        // The search/replace panel (@codemirror/search's SearchPanel) is
        // built from plain, unstyled <input>/<button>/<label> elements —
        // these rules restyle its exact DOM (confirmed against that
        // package's source: the panel div is class="cm-search", its two
        // text fields are class="cm-textfield", every action button is
        // class="cm-button", and the dismiss button is the one node with
        // name="close") to look like the rest of the app's form controls
        // instead of bare browser defaults.
        '.cm-panels': {
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.75rem',
        },
        '.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
        '.cm-panels-bottom': { borderTop: '1px solid var(--color-border)' },
        '.cm-search': {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.5rem',
        },
        // The panel's own markup uses a bare <br> to start the replace row
        // on its own line — flex layout doesn't honor that, so this makes
        // the <br> a full-width flex item instead, which forces the wrap.
        '.cm-search br': { flexBasis: '100%', height: 0 },
        '.cm-search .cm-textfield': {
          height: '1.5rem',
          minWidth: '8rem',
          padding: '0 0.5rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-input)',
          backgroundColor: 'transparent',
          color: 'var(--color-foreground)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          outline: 'none',
          // Without this, the browser still draws its own native
          // platform chrome (a gradient/bevel) underneath these styles —
          // `background-color`/`border` alone don't turn that off.
          appearance: 'none',
          WebkitAppearance: 'none',
        },
        '.cm-search .cm-textfield:focus': {
          borderColor: 'var(--color-ring)',
          boxShadow: '0 0 0 1px var(--color-ring)',
        },
        '.cm-search .cm-button': {
          height: '1.5rem',
          padding: '0 0.5rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          boxShadow: 'none',
          color: 'var(--color-muted-foreground)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
        },
        '.cm-search .cm-button:hover': {
          backgroundColor: 'var(--color-muted)',
          color: 'var(--color-foreground)',
          borderColor: 'var(--color-border)',
        },
        '.cm-search label': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          color: 'var(--color-muted-foreground)',
          fontSize: '0.7rem',
        },
        '.cm-search input[type=checkbox]': {
          accentColor: 'var(--color-foreground)',
        },
        '.cm-search [name=close]': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.25rem',
          height: '1.25rem',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          boxShadow: 'none',
          color: 'var(--color-muted-foreground)',
          appearance: 'none',
          WebkitAppearance: 'none',
        },
        '.cm-search [name=close]:hover': {
          backgroundColor: 'var(--color-muted)',
          color: 'var(--color-foreground)',
        },
      },
      { dark: isDark },
    )
    // CodeMirror's own base theme (gutters, active line, panels, buttons,
    // search-match highlight, etc.) ships as a `Prec.lowest` extension
    // specifically so application themes are meant to override it — but
    // several of our selectors above land at the *same* CSS specificity as
    // theirs (both expand to a two-class descendant selector scoped off
    // `.cm-editor`), so without an explicit higher precedence here the
    // outcome depends on extension load order rather than being guaranteed.
    // `Prec.highest` removes that ambiguity.
    return Prec.highest([theme, syntaxHighlighting(highlightStyle)])
  }, [isDark])
}

/** A large, code-editor-like textarea: line-number gutter, in-editor search
 * and search-and-replace (Mod-F), and syntax highlighting based on
 * `language` — all from CodeMirror 6's `basicSetup`, themed to match the
 * app's own colors. `readOnly` instances drop the extensions that only
 * matter for editing, since they're the ones most likely to be duplicated
 * across many pinned widgets at once (see the JSON Formatter output pane). */
export const CodeEditor = forwardRef<ReactCodeMirrorRef, CodeEditorProps>(function CodeEditor(
  { value, onChange, language, readOnly, placeholder, className, 'aria-label': ariaLabel, extraExtensions },
  ref,
) {
  const isDark = useIsDarkTheme()
  const appTheme = useAppEditorTheme(isDark)
  // Captured via onCreateEditor rather than reused from the forwarded
  // `ref` — a caller may or may not pass one, and this button needs the
  // live EditorView either way to open the search panel programmatically
  // (the same panel Mod-F already opens; this is just a discoverable
  // on-screen trigger for it).
  const viewRef = useRef<EditorView | null>(null)
  const extensions = useMemo(() => {
    const exts = language ? LANGUAGE_EXTENSIONS[language]() : []
    // React's `aria-label` prop on <CodeMirror> would land on the
    // component's outer wrapper div, not on `.cm-content` itself (the
    // element that actually carries role="textbox") — an ancestor's
    // aria-label doesn't contribute to a descendant's accessible name, so
    // it has to be set directly on the content element via this facet
    // instead for `getByRole('textbox', { name })` (tests) and screen
    // readers alike to pick it up.
    if (ariaLabel) {
      exts.push(EditorView.contentAttributes.of({ 'aria-label': ariaLabel }))
    }
    if (extraExtensions) {
      exts.push(...extraExtensions)
    }
    return exts
  }, [language, ariaLabel, extraExtensions])

  return (
    <div
      data-slot="code-editor"
      className={cn(
        'relative overflow-hidden rounded-md border border-border bg-background dark:bg-muted/40',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => viewRef.current && openSearchPanel(viewRef.current)}
        aria-label={readOnly ? 'Find' : 'Find and replace'}
        title={readOnly ? 'Find' : 'Find and replace'}
        className="absolute right-1 top-1 z-10 bg-inherit text-muted-foreground"
      >
        <Search className="size-3.5" />
      </Button>
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={appTheme}
        readOnly={readOnly}
        placeholder={placeholder}
        height="100%"
        onCreateEditor={(view) => {
          viewRef.current = view
        }}
        // @uiw/react-codemirror renders its own wrapper div (`cm-theme-*`)
        // around CodeMirror's actual root (`.cm-editor`), one level inside
        // this component's own wrapper above. That div has no height of
        // its own by default, so `.cm-editor`'s `height: 100%` (from the
        // `height` prop below) resolves against an auto-height parent —
        // which CSS treats as `auto` too — and the editor grows to fit
        // its content instead of being capped, silently clipped by this
        // wrapper's `overflow-hidden` with no scrollbar. Forwarding a
        // `className` here bounds that middle div to this wrapper's own
        // (correctly flex-bounded) height, so the cap actually reaches
        // `.cm-editor`.
        className="h-full"
        basicSetup={{
          highlightActiveLine: !readOnly,
          autocompletion: !readOnly,
          closeBrackets: !readOnly,
          foldGutter: !readOnly,
        }}
      />
    </div>
  )
})

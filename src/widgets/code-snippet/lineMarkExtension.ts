/** A widget-specific CodeMirror extension: it shows the current
 * highlighted/blurred lines as live decorations in the editor, lets clicking
 * a line number cycle that line's mark, and adds keyboard shortcuts to mark
 * a whole selection at once. Lives outside CodeEditor's own shared
 * `LANGUAGE_EXTENSIONS` map since nothing else needs a clickable gutter (see
 * CodeEditor's `extraExtensions` doc comment). */

import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { Prec, RangeSetBuilder, type Extension } from '@codemirror/state'

export interface LineMarkExtensionOptions {
  highlighted: Set<number>
  blurred: Set<number>
  onLineNumberClick: (lineNumber: number) => void
  onToggleHighlightShortcut: (lineNumbers: number[]) => void
  onToggleBlurShortcut: (lineNumbers: number[]) => void
}

/** Every line number spanned by the current selection, one entry per line
 * even across a multi-line range, de-duplicated across multiple cursors. */
function selectedLineNumbers(view: EditorView): number[] {
  const lines = new Set<number>()
  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from).number
    const endLine = view.state.doc.lineAt(range.to).number
    for (let line = startLine; line <= endLine; line++) lines.add(line)
  }
  return Array.from(lines)
}

function buildLineDecorations(view: EditorView, highlighted: Set<number>, blurred: Set<number>): DecorationSet {
  if (highlighted.size === 0 && blurred.size === 0) return Decoration.none
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  // RangeSetBuilder requires strictly ascending positions, so this walks
  // line numbers in order rather than the Sets' own (insertion) order.
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const isHighlighted = highlighted.has(lineNumber)
    const isBlurred = blurred.has(lineNumber)
    if (!isHighlighted && !isBlurred) continue
    const line = doc.line(lineNumber)
    builder.add(line.from, line.from, Decoration.line({ class: isHighlighted ? 'cm-snippet-highlight' : 'cm-snippet-blur' }))
  }
  return builder.finish()
}

const lineMarkBaseTheme = EditorView.baseTheme({
  '.cm-snippet-highlight': { backgroundColor: 'color-mix(in oklab, var(--color-ring) 20%, transparent)' },
  '.cm-snippet-blur': { filter: 'blur(3px)' },
  '.cm-lineNumbers .cm-gutterElement': { cursor: 'pointer' },
})

export function lineMarkExtension(options: LineMarkExtensionOptions): Extension {
  const { highlighted, blurred, onLineNumberClick, onToggleHighlightShortcut, onToggleBlurShortcut } = options
  return [
    EditorView.decorations.of((view) => buildLineDecorations(view, highlighted, blurred)),
    // `lineNumbers()` here doesn't add a second gutter next to CodeEditor's
    // own default one — its gutter is a single value computed from *all*
    // `lineNumberConfig` instances in the state (CodeMirror merges their
    // `domEventHandlers` together), so this only attaches a click handler
    // to the gutter that's already there.
    lineNumbers({
      domEventHandlers: {
        click(view, line) {
          onLineNumberClick(view.state.doc.lineAt(line.from).number)
          return true
        },
      },
    }),
    // Above the editor's own default keymap precedence so these shortcuts
    // aren't shadowed by anything basicSetup already binds.
    Prec.high(
      keymap.of([
        {
          key: 'Mod-Shift-h',
          preventDefault: true,
          run: (view) => {
            onToggleHighlightShortcut(selectedLineNumbers(view))
            return true
          },
        },
        {
          key: 'Mod-Shift-b',
          preventDefault: true,
          run: (view) => {
            onToggleBlurShortcut(selectedLineNumbers(view))
            return true
          },
        },
      ]),
    ),
    lineMarkBaseTheme,
  ]
}

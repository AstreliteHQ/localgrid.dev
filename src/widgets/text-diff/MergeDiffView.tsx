import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { Compartment } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { MergeView, goToNextChunk, goToPreviousChunk, type Chunk } from '@codemirror/merge'
import { useAppEditorTheme } from '@/components/CodeEditor'
import { currentChunkIndex, type ChunkLike } from './mergeChunks'
import { useMergeChunkTheme } from './mergeTheme'

export interface MergeDiffViewHandle {
  goToNext(): void
  goToPrevious(): void
  swap(): void
}

const COLLAPSE_UNCHANGED = { margin: 3, minSize: 4 }

interface MergeDiffViewProps {
  original: string
  changed: string
  onOriginalChange: (value: string) => void
  onChangedChange: (value: string) => void
  isDark: boolean
  /** Fired on mount and after every doc/selection change on either pane —
   * lets the parent toolbar render "+N/-M" and "Change X of Y" without
   * duplicating a diff computation of its own (see `mergeChunks.ts`). */
  onNavChange: (chunks: readonly ChunkLike[], index: number) => void
  className?: string
}

/** Line-mode diff view built directly on `@codemirror/merge`'s `MergeView`
 * — the app's first raw/imperative CodeMirror usage, everywhere else goes
 * through `@uiw/react-codemirror` via CodeEditor.tsx, but `MergeView` has no
 * React wrapper of its own and no controlled/`onChange` API, so this wires
 * `EditorView.updateListener` by hand instead.
 *
 * `original`/`changed` seed the panes at construction. Edits flow doc →
 * React state via `onOriginalChange`/`onChangedChange`, so while typing the
 * props always match the docs. A prop that differs from its pane's doc was
 * set from outside (a connected widget feeding this input) and is written
 * into the pane; the echo back through the update listener carries the same
 * value, so there is no feedback loop. `swap()` still dispatches directly
 * on each `EditorView`. */
export const MergeDiffView = forwardRef<MergeDiffViewHandle, MergeDiffViewProps>(function MergeDiffView(
  { original, changed, onOriginalChange, onChangedChange, isDark, onNavChange, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)
  // One shared Compartment reconfigured on both panes when the theme
  // changes — CodeMirror explicitly supports the same Compartment instance
  // appearing in more than one editor's config, as long as each dispatch
  // targets one specific view.
  const themeCompartment = useRef(new Compartment()).current

  // Read via refs inside the update listeners below rather than closed over
  // directly, so those listeners (registered once, at construction) always
  // call the latest callback without needing the merge view itself to be
  // torn down and rebuilt whenever a prop identity changes. Mirrored in an
  // effect rather than assigned directly in the render body — writing to a
  // ref during render is only sanctioned for lazy initialization, not for
  // keeping it in sync with props on every render.
  const onOriginalChangeRef = useRef(onOriginalChange)
  const onChangedChangeRef = useRef(onChangedChange)
  const onNavChangeRef = useRef(onNavChange)
  useLayoutEffect(() => {
    onOriginalChangeRef.current = onOriginalChange
    onChangedChangeRef.current = onChangedChange
    onNavChangeRef.current = onNavChange
  })

  const appTheme = useAppEditorTheme(isDark)
  const chunkTheme = useMergeChunkTheme()

  const refreshNavState = () => {
    const merge = mergeViewRef.current
    if (!merge) return
    const chunks: readonly Chunk[] = merge.chunks
    const headPos = merge.a.state.selection.main.head
    onNavChangeRef.current(chunks, currentChunkIndex(chunks, headPos))
  }

  // Constructed exactly once — see the component doc comment above for why
  // `original`/`changed` aren't in this effect's dependency array.
  useLayoutEffect(() => {
    if (!containerRef.current) return

    const listener = (side: 'a' | 'b') => (update: ViewUpdate) => {
      if (update.docChanged) {
        const text = update.state.doc.toString()
        if (side === 'a') onOriginalChangeRef.current(text)
        else onChangedChangeRef.current(text)
      }
      if (update.docChanged || (side === 'a' && update.selectionSet)) refreshNavState()
      if (update.docChanged) {
        // @codemirror/merge only computes which unchanged runs are
        // collapsible once, via a StateField's `init` — at construction,
        // against whatever content the panes started with (here, a couple
        // of lines of placeholder sample text). It does NOT get recomputed
        // from scratch as the document grows; `update()` only trims
        // existing collapsed ranges that a chunk boundary moved into, it
        // never discovers newly-collapsible ones. Left alone, pasting a
        // large document in after mount — the realistic way anyone uses
        // this widget — would never collapse anything. Calling the public
        // `reconfigure()` again re-supplies a fresh `collapseUnchanged`
        // extension, which does force a recompute. This is safe to call
        // from inside an update listener (it starts new, separate
        // dispatches on each pane once the current one has already fully
        // applied, not a reentrant one) but does mean every edit costs two
        // extra dispatches — acceptable for what this buys: it's the whole
        // reason a 10,000-line file with one change stays scrollable
        // instead of dumping every unchanged line into the DOM.
        mergeViewRef.current?.reconfigure({ collapseUnchanged: COLLAPSE_UNCHANGED })
      }
    }

    const merge = new MergeView({
      parent: containerRef.current,
      a: {
        doc: original,
        extensions: [
          basicSetup,
          themeCompartment.of([appTheme, chunkTheme]),
          EditorView.contentAttributes.of({ 'aria-label': 'Original text' }),
          EditorView.updateListener.of(listener('a')),
        ],
      },
      b: {
        doc: changed,
        extensions: [
          basicSetup,
          themeCompartment.of([appTheme, chunkTheme]),
          EditorView.contentAttributes.of({ 'aria-label': 'Changed text' }),
          EditorView.updateListener.of(listener('b')),
        ],
      },
      highlightChanges: true,
      gutter: false,
      collapseUnchanged: COLLAPSE_UNCHANGED,
    })
    // `.cm-mergeView` scrolls itself (overflow-y: auto is one of
    // @codemirror/merge's own base styles) but has no height of its own by
    // default — without this it renders at full, unclipped document
    // height instead of scrolling within this component's flex-bounded
    // wrapper, silently defeating the point of this whole rewrite.
    merge.dom.classList.add('h-full')
    mergeViewRef.current = merge
    refreshNavState()

    return () => {
      merge.destroy()
      mergeViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Writes values set from outside into the panes (see the doc comment).
  useLayoutEffect(() => {
    const merge = mergeViewRef.current
    if (!merge) return
    for (const [view, value] of [
      [merge.a, original],
      [merge.b, changed],
    ] as const) {
      if (view.state.doc.toString() !== value) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
      }
    }
  }, [original, changed])

  // Reconfigures the already-mounted panes' theme in place on a light/dark
  // toggle, rather than tearing down and rebuilding the merge view.
  useLayoutEffect(() => {
    const merge = mergeViewRef.current
    if (!merge) return
    const next = [appTheme, chunkTheme]
    merge.a.dispatch({ effects: themeCompartment.reconfigure(next) })
    merge.b.dispatch({ effects: themeCompartment.reconfigure(next) })
  }, [appTheme, chunkTheme, themeCompartment])

  useImperativeHandle(
    ref,
    () => ({
      goToNext() {
        const merge = mergeViewRef.current
        if (!merge) return
        goToNextChunk(merge.a)
        refreshNavState()
      },
      goToPrevious() {
        const merge = mergeViewRef.current
        if (!merge) return
        goToPreviousChunk(merge.a)
        refreshNavState()
      },
      swap() {
        const merge = mergeViewRef.current
        if (!merge) return
        const { a, b } = merge
        const aDoc = a.state.doc.toString()
        const bDoc = b.state.doc.toString()
        // Each dispatch's own updateListener reports the new content back
        // through onOriginalChange/onChangedChange and refreshes nav state
        // — no need to do either of those explicitly here.
        a.dispatch({ changes: { from: 0, to: a.state.doc.length, insert: bDoc } })
        b.dispatch({ changes: { from: 0, to: b.state.doc.length, insert: aDoc } })
      },
    }),
    [],
  )

  return (
    <div
      ref={containerRef}
      data-slot="merge-diff-view"
      className={className}
    />
  )
})

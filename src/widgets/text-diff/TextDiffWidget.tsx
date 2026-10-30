import { useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronUp } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { CodeEditor } from '@/components/CodeEditor'
import { Button } from '@/components/ui/button'
import { useIsDarkTheme } from '@/theme/useThemeStore'
import { InputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { computeInlineDiff, inlineDiffToText, type DiffGranularity, type DiffPartType } from './computeTextDiff'
import { chunkStats, chunksToDiffText, type ChunkLike } from './mergeChunks'
import { MergeDiffView, type MergeDiffViewHandle } from './MergeDiffView'

const SAMPLE_ORIGINAL = 'The quick brown fox\njumps over the lazy dog.'
const SAMPLE_CHANGED = 'The quick brown fox\nleaps over the lazy dog!'

const SEGMENT_CLASS: Record<DiffPartType, string> = {
  added: 'rounded bg-success/15 text-success underline decoration-success/50',
  removed: 'rounded bg-destructive/15 text-destructive line-through decoration-destructive/50',
  unchanged: '',
}

/** Compares two texts. Line mode renders a synced, collapsible
 * `@codemirror/merge` view (see MergeDiffView.tsx) so a large input with a
 * handful of changes doesn't require scrolling through every unchanged
 * line to find them. Words/Chars mode keeps the original shape — two
 * editable CodeEditors on top, a derived read-only inline-segment flow
 * below — since a pure jsdiff computation over a short text (a sentence, a
 * URL) doesn't have the same "needle in a haystack" problem line mode did. */
export default function TextDiffWidget({ instanceId }: WidgetProps) {
  const [original, setOriginal] = useWidgetState(instanceId, 'original', SAMPLE_ORIGINAL)
  const [changed, setChanged] = useWidgetState(instanceId, 'changed', SAMPLE_CHANGED)
  const [granularity, setGranularity] = useWidgetState<DiffGranularity>(
    instanceId,
    'granularity',
    'lines',
  )
  const isDark = useIsDarkTheme()
  useWidgetDirty(instanceId, original !== SAMPLE_ORIGINAL || changed !== SAMPLE_CHANGED)

  const mergeRef = useRef<MergeDiffViewHandle>(null)
  const [chunks, setChunks] = useState<readonly ChunkLike[]>([])
  const [chunkIndex, setChunkIndex] = useState(-1)

  const lineStats = useMemo(() => chunkStats(chunks, original, changed), [chunks, original, changed])
  const lineIdentical = chunks.length === 0
  const lineCopyText = useMemo(
    () => chunksToDiffText(original, changed, chunks),
    [original, changed, chunks],
  )

  const inlineResult = useMemo(
    () => (granularity === 'lines' ? null : computeInlineDiff(original, changed, granularity)),
    [granularity, original, changed],
  )

  const swap = () => {
    if (granularity === 'lines') {
      // The merge view is uncontrolled (see MergeDiffView's doc comment) —
      // it ignores `original`/`changed` prop changes after mount, so
      // swapping has to go through its own imperative handle instead of
      // just flipping the two widget-state values here.
      mergeRef.current?.swap()
    } else {
      setOriginal(changed)
      setChanged(original)
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={granularity}
          onChange={setGranularity}
          options={[
            { label: 'Lines', value: 'lines' },
            { label: 'Words', value: 'words' },
            { label: 'Chars', value: 'chars' },
          ]}
        />
        <div className="flex items-center gap-2">
          {granularity === 'lines' ? (
            lineIdentical ? (
              <span className="text-muted-foreground">No differences</span>
            ) : (
              <>
                <span className="font-mono">
                  <span className="text-success">+{lineStats.additions}</span>{' '}
                  <span className="text-destructive">-{lineStats.deletions}</span>
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => mergeRef.current?.goToPrevious()}
                    aria-label="Previous change"
                    title="Previous change"
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <span aria-live="polite" className="min-w-20 text-center text-muted-foreground">
                    Change {chunkIndex + 1} of {chunks.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => mergeRef.current?.goToNext()}
                    aria-label="Next change"
                    title="Next change"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>
              </>
            )
          ) : (
            inlineResult &&
            !inlineResult.identical && (
              <span className="font-mono">
                <span className="text-success">+{inlineResult.stats.additions}</span>{' '}
                <span className="text-destructive">-{inlineResult.stats.deletions}</span>
              </span>
            )
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={swap}
            aria-label="Swap original and changed text"
            title="Swap original and changed text"
          >
            <ArrowLeftRight className="size-3.5" />
            Swap
          </Button>
        </div>
      </div>

      {granularity === 'lines' ? (
        <div className="relative min-h-0 flex-1">
          <MergeDiffView
            ref={mergeRef}
            original={original}
            changed={changed}
            onOriginalChange={setOriginal}
            onChangedChange={setChanged}
            isDark={isDark}
            onNavChange={(nextChunks, nextIndex) => {
              setChunks(nextChunks)
              setChunkIndex(nextIndex)
            }}
            className="h-full overflow-hidden rounded-md border border-border bg-background dark:bg-muted/40"
          />
          {/* One merge view holds both texts, so each input marks its half. */}
          <InputSlot input="original" className="absolute inset-y-0 left-0 w-1/2" />
          <InputSlot input="changed" className="absolute inset-y-0 right-0 w-1/2" />
          {!lineIdentical && (
            <CopyButton value={lineCopyText} className="absolute right-1 top-1 z-10 bg-inherit" />
          )}
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-[2] grid-cols-2 gap-2">
            <InputSlot input="original" className="flex min-h-0 flex-col">
              <CodeEditor
                value={original}
                onChange={setOriginal}
                placeholder="Original text…"
                aria-label="Original text"
                className="min-h-0 flex-1"
              />
            </InputSlot>
            <InputSlot input="changed" className="flex min-h-0 flex-col">
              <CodeEditor
                value={changed}
                onChange={setChanged}
                placeholder="Changed text…"
                aria-label="Changed text"
                className="min-h-0 flex-1"
              />
            </InputSlot>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background font-mono dark:bg-muted/40">
            {inlineResult && (
              <>
                {inlineResult.identical ? (
                  <p className="p-2 text-muted-foreground">No differences</p>
                ) : (
                  <p aria-label="Diff result" className="p-2 whitespace-pre-wrap break-words">
                    {inlineResult.segments.map((segment, index) => (
                      <span key={index} className={SEGMENT_CLASS[segment.type]}>
                        {segment.text}
                      </span>
                    ))}
                  </p>
                )}
                {!inlineResult.identical && (
                  <CopyButton
                    value={inlineDiffToText(inlineResult)}
                    className="absolute right-1 top-1 bg-inherit"
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

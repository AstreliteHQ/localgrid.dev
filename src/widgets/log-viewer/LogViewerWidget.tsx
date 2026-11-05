import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { foldEffect, unfoldAll } from '@codemirror/language'
import { ChevronDown, ChevronUp, EyeOff } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { NumberField } from '@/components/NumberField'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { InputSlot } from '@/flow/FlowSlots'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { computeFoldRanges, foldDisplayExtension } from './foldNonMatching'
import { logHighlightExtension } from './logHighlight'
import { findPatternMatches, LOG_PATTERNS, type LogPatternGroup, type LogPatternId, type MatchRange } from './logPatterns'

const SAMPLE_LOG = `2026-08-30T09:12:03.501Z INFO  booting service on port 8080
2026-08-30T09:12:04.118Z WARN  cache miss for key "user:42", falling back to DB
2026-08-30T09:12:05.902Z ERROR failed to connect to upstream payment-api, retrying
2026-08-30T09:12:05.903Z ERROR   at PaymentClient.charge (payment.ts:88)
2026-08-30T09:12:06.221Z CRITICAL database connection pool exhausted, restarting
2026-08-30T09:12:07.004Z Exception: NullPointerException in OrderProcessor.process()
2026-08-30T09:12:08.311Z ERROR request timed out after 30s
2026-08-30T09:12:09.045Z WARN  access denied for user "guest" on /admin`

/** Only the count badge carries the pattern's group color. Solid pastel
 * fill (like ShareModal.tsx's amber notice), not a translucent tint: the
 * chip sits on both the plain `outline` background and the inverted
 * `default` one, and a solid fill stays legible on either. */
const GROUP_BADGE_CLASS: Record<LogPatternGroup, string> = {
  severe: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  caution: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  auth: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

const DISABLED_BADGE_CLASS = 'bg-muted-foreground/15 text-muted-foreground'

/** Pastes raw application logs into a syntax-highlighted editor (see
 * `logHighlight.ts`) with one toggle button per detected pattern. Any
 * number of patterns can be pressed at once; the navigator below jumps
 * through the pooled matches of every pressed pattern, "N of M" style. */
export default function LogViewerWidget({ instanceId }: WidgetProps) {
  const [logText, setLogText] = useWidgetState(instanceId, 'logText', SAMPLE_LOG)
  useWidgetDirty(instanceId, logText !== SAMPLE_LOG)

  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const extraExtensions = useMemo(() => [logHighlightExtension(), foldDisplayExtension()], [])

  const [hideNonMatching, setHideNonMatching] = useWidgetState(instanceId, 'hideNonMatching', false)
  const [contextLines, setContextLines] = useWidgetState(instanceId, 'contextLines', 1)

  const matchesByPattern = useMemo(() => {
    const map = {} as Record<LogPatternId, MatchRange[]>
    for (const def of LOG_PATTERNS) map[def.id] = findPatternMatches(logText, def)
    return map
  }, [logText])

  // Not persisted, like TextDiffWidget's chunkIndex: transient nav state.
  // Defaults to every pattern with a match on mount, computed once; toggling
  // is entirely up to the user after that.
  const [selectedPatterns, setSelectedPatterns] = useState<Set<LogPatternId>>(
    () => new Set(LOG_PATTERNS.filter((def) => matchesByPattern[def.id].length > 0).map((def) => def.id)),
  )
  const [matchIndex, setMatchIndex] = useState(0)

  const combinedMatches = useMemo(() => {
    const merged = LOG_PATTERNS.filter((def) => selectedPatterns.has(def.id)).flatMap(
      (def) => matchesByPattern[def.id],
    )
    merged.sort((a, b) => a.from - b.from)
    return merged
  }, [selectedPatterns, matchesByPattern])
  const activeIndex =
    combinedMatches.length > 0
      ? ((matchIndex % combinedMatches.length) + combinedMatches.length) % combinedMatches.length
      : -1

  const jumpTo = (match: MatchRange | undefined) => {
    const view = editorRef.current?.view
    if (!match || !view) return
    view.dispatch({ selection: { anchor: match.from, head: match.to }, scrollIntoView: true })
    view.focus()
  }

  const togglePattern = (id: LogPatternId) => {
    const next = new Set(selectedPatterns)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedPatterns(next)
    setMatchIndex(0)
    const merged = LOG_PATTERNS.filter((def) => next.has(def.id)).flatMap((def) => matchesByPattern[def.id])
    merged.sort((a, b) => a.from - b.from)
    jumpTo(merged[0])
  }

  // Only patterns with a current match count toward "all selected", since a
  // pattern with nothing to show can't be toggled anyway.
  const enabledDefs = LOG_PATTERNS.filter((def) => matchesByPattern[def.id].length > 0)
  const allSelected = enabledDefs.length > 0 && enabledDefs.every((def) => selectedPatterns.has(def.id))

  const toggleAllPatterns = () => {
    const next = allSelected ? new Set<LogPatternId>() : new Set(enabledDefs.map((def) => def.id))
    setSelectedPatterns(next)
    setMatchIndex(0)
    if (next.size === 0) return
    const merged = LOG_PATTERNS.filter((def) => next.has(def.id)).flatMap((def) => matchesByPattern[def.id])
    merged.sort((a, b) => a.from - b.from)
    jumpTo(merged[0])
  }

  const goTo = (delta: number) => {
    if (combinedMatches.length === 0) return
    const next = (activeIndex + delta + combinedMatches.length) % combinedMatches.length
    setMatchIndex(next)
    jumpTo(combinedMatches[next])
  }

  const foldRanges = useMemo(
    () => (hideNonMatching ? computeFoldRanges(logText, combinedMatches, contextLines) : []),
    [hideNonMatching, logText, combinedMatches, contextLines],
  )

  // Folding depends on React state (toggled patterns, context lines), not
  // just the document, so it's applied imperatively rather than through a
  // declarative extension. useLayoutEffect avoids a flash of stale layout.
  useLayoutEffect(() => {
    const view = editorRef.current?.view
    if (!view) return
    // Reset first rather than diffing against the previous fold state.
    unfoldAll(view)
    if (foldRanges.length > 0) {
      view.dispatch({ effects: foldRanges.map((range) => foldEffect.of(range)) })
    }
  }, [foldRanges])

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {LOG_PATTERNS.map((def) => {
          const count = matchesByPattern[def.id].length
          // selectedPatterns remembers a toggle even at zero matches, so it
          // reappears without a re-click. But a disabled+pressed button
          // would render as a bold solid block, not the usual faded
          // disabled look, so the visual pressed state also requires a match.
          const isPressed = count > 0 && selectedPatterns.has(def.id)
          return (
            <Button
              key={def.id}
              type="button"
              // outline/default rather than ghost/secondary: a visible
              // border reads more clearly as "pressable" than a ghost fill.
              variant={isPressed ? 'default' : 'outline'}
              size="xs"
              aria-pressed={isPressed}
              // The count badge is a separate span, so it needs its own
              // accessible name (otherwise "Error3" reads as one word).
              aria-label={`${def.label} (${count})`}
              disabled={count === 0}
              onClick={() => togglePattern(def.id)}
              title={`${isPressed ? 'Hide' : 'Show'} ${def.label.toLowerCase()} matches in the navigator`}
              className="font-medium"
            >
              {def.label}
              <span
                aria-hidden="true"
                className={cn(
                  'ml-0.5 rounded-full px-1.5 tabular-nums',
                  count === 0 ? DISABLED_BADGE_CLASS : GROUP_BADGE_CLASS[def.group],
                )}
              >
                {count}
              </span>
            </Button>
          )
        })}
        <Button
          type="button"
          variant={allSelected ? 'default' : 'outline'}
          size="xs"
          aria-pressed={allSelected}
          disabled={enabledDefs.length === 0}
          onClick={toggleAllPatterns}
          aria-label={allSelected ? 'Deselect all patterns' : 'Select all patterns'}
          title={allSelected ? 'Deselect all patterns' : 'Select all patterns'}
          className="font-medium"
        >
          All
        </Button>
      </div>

      {combinedMatches.length > 0 && (
        <div className="flex items-center gap-0.5 self-end">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => goTo(-1)}
            aria-label="Previous match"
            title="Previous match"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <span aria-live="polite" className="min-w-16 text-center text-muted-foreground">
            {activeIndex + 1} of {combinedMatches.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => goTo(1)}
            aria-label="Next match"
            title="Next match"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      )}

      <InputSlot input="logText" className="flex min-h-0 flex-1 flex-col">
        <CodeEditor
          ref={editorRef}
          value={logText}
          onChange={setLogText}
          language="plaintext"
          extraExtensions={extraExtensions}
          placeholder="Paste application logs…"
          aria-label="Log input"
          className="min-h-0 flex-1"
        />
      </InputSlot>

      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          variant={hideNonMatching ? 'default' : 'outline'}
          size="xs"
          aria-pressed={hideNonMatching}
          disabled={combinedMatches.length === 0}
          onClick={() => setHideNonMatching((prev) => !prev)}
          title="Fold away lines that don't contain a toggled-on pattern"
          className="font-medium"
        >
          <EyeOff className="size-3.5" />
          Hide non-matching lines
        </Button>
        {hideNonMatching && (
          <div className="w-16">
            <NumberField label="Context" value={contextLines} min={0} max={20} onChange={setContextLines} />
          </div>
        )}
      </div>
    </div>
  )
}

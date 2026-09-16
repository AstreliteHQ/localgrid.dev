import { useDeferredValue, useMemo, type ReactNode } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  deduplicate,
  joinEntries,
  topDuplicates,
  type OutputOrder,
  type SplitMode,
  type UniqueEntry,
} from './deduplicate'

type Tab = 'result' | 'duplicates'

/** How many duplicate rows the summary renders. Counting every duplicate is
 * part of the same pass that deduplicates, so it is effectively free (a
 * million items costs ~800ms either way), but one DOM row per duplicated
 * value is not: 10k rows already cost ~240ms to lay out and 100k cost
 * ~2.5s. So the count stays exact and complete, and only the *list* is
 * capped, with the remainder reported as a total. */
const MAX_DUPLICATE_ROWS = 200

const SPLIT_OPTIONS: { label: string; value: SplitMode }[] = [
  { label: 'Lines', value: 'lines' },
  { label: 'Commas', value: 'comma' },
  { label: 'Spaces', value: 'whitespace' },
]

const ORDER_OPTIONS: { label: string; value: OutputOrder }[] = [
  { label: 'First seen', value: 'first-seen' },
  { label: 'A→Z', value: 'alphabetical' },
  { label: 'Count', value: 'frequency' },
]

function count(value: number): string {
  return value.toLocaleString('en-US')
}

export default function DuplicateRemoverWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  const [splitMode, setSplitMode] = useWidgetState<SplitMode>(instanceId, 'splitMode', 'lines')
  const [order, setOrder] = useWidgetState<OutputOrder>(instanceId, 'order', 'first-seen')
  const [trim, setTrim] = useWidgetState(instanceId, 'trim', true)
  const [ignoreCase, setIgnoreCase] = useWidgetState(instanceId, 'ignoreCase', false)
  const [tab, setTab] = useWidgetState<Tab>(instanceId, 'tab', 'result')
  useWidgetDirty(instanceId, input.length > 0)

  // A pasted list can run to hundreds of thousands of items, where a pass
  // costs long enough to be felt. Deferring the value keeps typing and the
  // option buttons responsive: React renders the keystroke first and
  // recomputes against the settled text.
  const deferredInput = useDeferredValue(input)
  const stale = deferredInput !== input

  const result = useMemo(
    () => deduplicate(deferredInput, { splitMode, trim, ignoreCase, order }),
    [deferredInput, splitMode, trim, ignoreCase, order],
  )
  const output = useMemo(() => joinEntries(result.entries, splitMode, trim), [result, splitMode, trim])
  const duplicates = useMemo(() => topDuplicates(result.entries, MAX_DUPLICATE_ROWS), [result])

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste a list, one item per line…"
        spellCheck={false}
        className="h-16 w-full flex-1 resize-none p-2 font-mono text-xs"
      />

      {/* Split and the two comparison toggles decide what counts as an
       * item; the order control only decides how the result is arranged,
       * so it sits on its own row rather than among them. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <SegmentedControl value={splitMode} onChange={setSplitMode} options={SPLIT_OPTIONS} />
        <ToggleButton pressed={trim} onClick={() => setTrim((previous) => !previous)}>
          Trim
        </ToggleButton>
        <ToggleButton pressed={ignoreCase} onClick={() => setIgnoreCase((previous) => !previous)}>
          Ignore case
        </ToggleButton>
      </div>
      <SegmentedControl value={order} onChange={setOrder} options={ORDER_OPTIONS} className="self-start" />

      <p className={cn('text-muted-foreground', stale && 'opacity-60')}>
        {result.total === 0 ? (
          'Nothing to deduplicate yet.'
        ) : (
          <>
            <span className="font-medium text-foreground">{count(result.total)}</span> items ·{' '}
            <span className="font-medium text-foreground">{count(result.uniqueCount)}</span> unique ·{' '}
            <span className={cn('font-medium', result.removedCount > 0 ? 'text-success' : 'text-foreground')}>
              {count(result.removedCount)}
            </span>{' '}
            removed
          </>
        )}
      </p>

      <div className="flex items-center gap-1.5">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { label: 'Result', value: 'result' },
            {
              label: `Duplicates${result.duplicatedValues > 0 ? ` (${count(result.duplicatedValues)})` : ''}`,
              value: 'duplicates',
            },
          ]}
        />
        {result.removedCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="ml-auto"
            // While a large paste is still being worked through, `output`
            // belongs to the previous input: writing it back would undo
            // the edit that is waiting to be processed.
            disabled={stale}
            onClick={() => {
              if (!stale) setInput(output)
            }}
            title="Replace the input with the deduplicated list"
          >
            Use as input
          </Button>
        )}
      </div>

      {tab === 'result' ? (
        <div className="relative min-h-0 flex-1">
          <Textarea
            readOnly
            value={output}
            placeholder="Unique items"
            spellCheck={false}
            className="h-full w-full resize-none border-border bg-background p-2 pr-16 font-mono text-xs dark:bg-muted/40"
          />
          <CopyButton value={output} className="absolute right-1 top-1" />
        </div>
      ) : (
        <DuplicatesPane
          duplicates={duplicates}
          duplicatedValues={result.duplicatedValues}
          hasInput={result.total > 0}
        />
      )}
    </div>
  )
}

function ToggleButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        'h-auto rounded px-2 py-1 text-xs font-medium',
        pressed
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
      )}
    >
      {children}
    </Button>
  )
}

function DuplicatesPane({
  duplicates,
  duplicatedValues,
  hasInput,
}: {
  duplicates: UniqueEntry[]
  duplicatedValues: number
  hasInput: boolean
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
      {!hasInput ? (
        <p className="text-muted-foreground">Paste a list above to see which items repeat, and how often.</p>
      ) : duplicates.length === 0 ? (
        <p className="text-success">Every item is already unique.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {duplicates.map((entry) => (
              <li key={entry.value} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
                <span className="truncate font-mono" title={entry.value}>
                  {entry.value}
                </span>
                <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  × {count(entry.count)}
                </span>
              </li>
            ))}
          </ul>
          {duplicatedValues > duplicates.length && (
            <p className="mt-1.5 text-muted-foreground">
              Showing the {count(duplicates.length)} most repeated of {count(duplicatedValues)} duplicated values.
            </p>
          )}
        </>
      )}
    </div>
  )
}

import { useDeferredValue, useMemo } from 'react'
import { CodeEditor } from '@/components/CodeEditor'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { analyzeComplexity, MAX_SOURCE_LENGTH, type Confidence, type Finding } from './analyze'
import { describeGrowth, formatGrowth } from './growth'

type Tab = 'why' | 'functions'

/** Opens on a snippet that is quietly quadratic: a nested scan that reads
 * as innocent until the estimator points at the inner `includes`. */
const SAMPLE = `function duplicates(items) {
  const found = []
  for (const item of items) {
    if (found.includes(item)) continue
    found.push(item)
  }
  return found
}`

/** Findings are one row each, and a long snippet can produce a lot of
 * them. The verdict already reports the worst, so the list shows the
 * heaviest handful and says how many it left out. */
const MAX_FINDINGS_SHOWN = 12

const CONFIDENCE_STYLES: Record<Confidence, { label: string; className: string }> = {
  high: { label: 'High confidence', className: 'bg-success/15 text-success' },
  medium: { label: 'Medium confidence', className: 'bg-muted text-muted-foreground' },
  low: { label: 'Low confidence', className: 'bg-destructive/10 text-destructive' },
}

export default function ComplexityEstimatorWidget({ instanceId }: WidgetProps) {
  const [source, setSource] = useWidgetState(instanceId, 'source', SAMPLE)
  const [tab, setTab] = useWidgetState<Tab>(instanceId, 'tab', 'why')
  useWidgetDirty(instanceId, source !== SAMPLE)

  // Parsing and walking a snippet at the size limit is quick, but it still
  // runs on every keystroke; deferring it keeps typing ahead of it.
  const deferredSource = useDeferredValue(source)
  const result = useMemo(() => analyzeComplexity(deferredSource), [deferredSource])

  const overLimit = source.length > MAX_SOURCE_LENGTH
  const shownFindings = result.ok ? result.findings.slice(0, MAX_FINDINGS_SHOWN) : []

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <CodeEditor
        value={source}
        onChange={setSource}
        language="javascript"
        placeholder="Paste a JavaScript or TypeScript snippet…"
        aria-label="Code snippet"
        className="min-h-24 flex-1"
      />

      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn('tabular-nums', overLimit && 'font-medium text-destructive')}>
          {source.length.toLocaleString('en-US')} / {MAX_SOURCE_LENGTH.toLocaleString('en-US')} characters
        </span>
        <span className="ml-auto truncate">JavaScript / TypeScript</span>
      </div>

      {!result.ok ? (
        <div className="flex min-h-0 flex-1 items-start rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
          {overLimit || source.trim().length > 0 ? (
            <ErrorMessage>{result.reason}</ErrorMessage>
          ) : (
            <p className="text-muted-foreground">
              Paste a function to estimate how its running time grows with the size of its input.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* A live region: the verdict changes under the reader as the
           * snippet is edited, and it is the one thing on the widget worth
           * announcing when it does. */}
          <div role="status" aria-label="Estimated complexity" className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums">{formatGrowth(result.growth)}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                CONFIDENCE_STYLES[result.confidence].className,
              )}
            >
              {CONFIDENCE_STYLES[result.confidence].label}
            </span>
          </div>
          <p className="text-muted-foreground">{describeGrowth(result.growth)}</p>

          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { label: `Why (${result.findings.length})`, value: 'why' },
              { label: `Functions (${result.functions.length})`, value: 'functions' },
            ]}
            className="self-start"
          />

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
            {tab === 'why' ? (
              <WhyPane findings={shownFindings} total={result.findings.length} notes={result.notes} />
            ) : (
              <FunctionsPane functions={result.functions} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function WhyPane({ findings, total, notes }: { findings: Finding[]; total: number; notes: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      {findings.length === 0 ? (
        <p className="text-muted-foreground">
          No loops, recursion, or library calls that grow with the input. The work is constant.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {findings.map((finding, index) => (
            <li
              key={`${finding.line}-${index}`}
              className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-accent"
            >
              <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                {finding.line}
              </span>
              <span className="min-w-0 flex-1 truncate" title={finding.message}>
                {finding.message}
              </span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {formatGrowth(finding.growth)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {total > findings.length && (
        <p className="text-muted-foreground">
          Showing the {findings.length} heaviest of {total} contributing lines.
        </p>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-muted-foreground">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        {/* Stated on every result, not just the shaky ones: this reads the
         * shape of the code, and a shape can lie about what the code
         * really does at runtime. */}
        <p>
          An estimate read from the code's shape: <span className="font-mono">n</span> is whatever the code iterates
          over, early exits are ignored, and every collection is assumed to grow together.
        </p>
      </div>
    </div>
  )
}

function FunctionsPane({
  functions,
}: {
  functions: { name: string; line: number; growth: Parameters<typeof formatGrowth>[0]; recursive: boolean }[]
}) {
  if (functions.length === 0) {
    return <p className="text-muted-foreground">No named functions; the snippet was read as top-level code.</p>
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {functions.map((report) => (
        <li
          key={`${report.name}-${report.line}`}
          className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-accent"
        >
          <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{report.line}</span>
          <span className="min-w-0 flex-1 truncate font-mono" title={report.name}>
            {report.name}
            {report.recursive && <span className="ml-1 text-muted-foreground">(recursive)</span>}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {formatGrowth(report.growth)}
          </span>
        </li>
      ))}
    </ul>
  )
}

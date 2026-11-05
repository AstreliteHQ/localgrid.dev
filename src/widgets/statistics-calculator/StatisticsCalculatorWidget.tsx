import { useMemo } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/formatNumber'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { computeStatistics, parseNumberList, type Statistics } from './computeStatistics'

const DEFAULT_INPUT = '4, 8, 15, 16, 23, 42'

function formatSummary(stats: Statistics): string {
  return [
    `Count: ${stats.count}`,
    `Sum: ${formatNumber(stats.sum)}`,
    `Mean: ${formatNumber(stats.mean)}`,
    `Median: ${formatNumber(stats.median)}`,
    `Mode: ${stats.mode.length ? stats.mode.map((n) => formatNumber(n)).join(', ') : 'none'}`,
    `Min: ${formatNumber(stats.min)}`,
    `Max: ${formatNumber(stats.max)}`,
    `Range: ${formatNumber(stats.range)}`,
    `Variance: ${formatNumber(stats.variance)}`,
    `Std dev: ${formatNumber(stats.standardDeviation)}`,
  ].join('\n')
}

export default function StatisticsCalculatorWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', DEFAULT_INPUT)
  useWidgetDirty(instanceId, input !== DEFAULT_INPUT)

  const values = useMemo(() => parseNumberList(input), [input])
  const stats = useMemo(() => computeStatistics(values), [values])
  const summary = stats ? formatSummary(stats) : ''

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Numbers separated by commas, spaces, or new lines…"
        spellCheck={false}
        aria-label="Number list"
        className="min-h-16 flex-1 resize-none font-mono"
      />

      {!stats ? (
        <p className="text-muted-foreground">Enter at least one number.</p>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto rounded-md bg-background p-2 font-mono text-[11px] text-foreground dark:bg-muted/40">
            <StatRow label="Count" value={String(stats.count)} />
            <StatRow label="Sum" value={formatNumber(stats.sum)} />
            <StatRow label="Mean" value={formatNumber(stats.mean)} />
            <StatRow label="Median" value={formatNumber(stats.median)} />
            <StatRow
              label="Mode"
              value={stats.mode.length ? stats.mode.map((n) => formatNumber(n)).join(', ') : '—'}
            />
            <StatRow label="Min" value={formatNumber(stats.min)} />
            <StatRow label="Max" value={formatNumber(stats.max)} />
            <StatRow label="Range" value={formatNumber(stats.range)} />
            <StatRow label="Variance" value={formatNumber(stats.variance)} />
            <StatRow label="Std dev" value={formatNumber(stats.standardDeviation)} />
          </div>
          <CopyButton value={summary} label="Copy summary" className="w-fit" />
        </>
      )}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

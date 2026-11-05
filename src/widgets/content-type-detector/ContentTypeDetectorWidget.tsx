import { useMemo } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { InputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { buildChains, type DetectionChain } from './detect'

// Accuracy thresholds for the confidence badge — green once it's a
// confident match, orange for a plausible-but-uncertain one, gray below
// that (a guess more than a match).
const ACCURACY_GOOD = 0.8
const ACCURACY_FAIR = 0.5

function chainConfidence(chain: DetectionChain): number {
  return chain.reduce((score, node) => score * node.confidence, 1)
}

export default function ContentTypeDetectorWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  useWidgetDirty(instanceId, input.length > 0)

  const chains = useMemo(() => buildChains(input), [input])

  return (
    <div className="flex h-full flex-col gap-2">
      <InputSlot input="input">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste text to identify…"
          spellCheck={false}
          className="h-16 w-full resize-none p-2 font-mono text-xs"
        />
      </InputSlot>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
        {chains.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Paste something above to see what it might be — Base64, hex, a JWT, JSON, a UUID… including things wrapped
            in each other.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {chains.map((chain, index) => (
              // Chains are stable for a given input (buildChains is pure and
              // dedupes), so an index key here won't reorder/lose state.
              <ChainRow key={index} chain={chain} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ChainRow({ chain }: { chain: DetectionChain }) {
  const last = chain[chain.length - 1]
  const score = chainConfidence(chain)

  return (
    <li className="rounded-md border border-border/60 p-1.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        {/* A breadcrumb, not a row of badges — badge styling is reserved for
         * the accuracy score below, so the chain itself reads as a trail
         * (peeled encoding layers, muted) leading to a destination (the
         * final classification, in full foreground weight) rather than a
         * strip of same-weight pills. */}
        {chain.map((node, index) => {
          const isLast = index === chain.length - 1
          return (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-muted-foreground/60">→</span>}
              <span
                title={`${Math.round(node.confidence * 100)}% confidence`}
                className={cn(isLast ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}
              >
                {node.label}
              </span>
            </span>
          )
        })}
        <AccuracyBadge score={score} className="ml-auto shrink-0" />
      </div>
      <div className="relative mt-1">
        <pre className="max-h-16 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-1.5 pr-12 font-mono text-[11px]">
          {last.value}
        </pre>
        <CopyButton value={last.value} className="absolute right-1 top-1 bg-inherit" />
      </div>
    </li>
  )
}

/** The one place actual badge styling (pill shape, tinted background)
 * still appears in this widget — reserved for the number that most needs
 * to be scannable at a glance across a list of chains. */
function AccuracyBadge({ score, className }: { score: number; className?: string }) {
  const tone = score >= ACCURACY_GOOD ? 'good' : score >= ACCURACY_FAIR ? 'fair' : 'low'

  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'good' && 'bg-success/15 text-success dark:bg-success/20',
        tone === 'fair' && 'bg-orange-500/15 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400',
        tone === 'low' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {Math.round(score * 100)}%
    </span>
  )
}

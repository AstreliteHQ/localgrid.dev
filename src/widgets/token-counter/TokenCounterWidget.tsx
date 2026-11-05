import { useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { countTextStats, estimateTokens } from './tokenCounter'

export default function TokenCounterWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  useWidgetDirty(instanceId, input.length > 0)

  const stats = useMemo(() => countTextStats(input), [input])
  const tokens = useMemo(() => estimateTokens(input), [input])

  return (
    <div className="flex h-full flex-col gap-2">
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste a prompt to estimate its tokens…"
        spellCheck={false}
        className="min-h-0 flex-1 resize-none p-2 font-mono text-xs"
      />
      <div className="rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          ChatGPT / Claude tokens
        </p>
        <p className="font-mono text-lg font-semibold text-foreground">~{tokens.toLocaleString()}</p>
        <p className="text-[11px] text-muted-foreground">token{tokens === 1 ? '' : 's'} · estimate</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {stats.characters.toLocaleString()} character{stats.characters === 1 ? '' : 's'} ·{' '}
        {stats.words.toLocaleString()} word{stats.words === 1 ? '' : 's'}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Rough estimate, not the real tokenizer,{' '}
        <a
          href="https://platform.claude.com/docs/en/build-with-claude/token-counting"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          use the count_tokens API
        </a>{' '}
        for an exact Claude count.
      </p>
    </div>
  )
}

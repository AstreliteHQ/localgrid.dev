import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { InputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'

const FLAG_OPTIONS = ['g', 'i', 'm', 's'] as const

interface Segment {
  text: string
  isMatch: boolean
}

export default function RegexTesterWidget({ instanceId }: WidgetProps) {
  const [pattern, setPattern] = useWidgetState(instanceId, 'pattern', '')
  const [flags, setFlags] = useWidgetState<string[]>(instanceId, 'flags', ['g'])
  const [text, setText] = useWidgetState(instanceId, 'text', '')
  useWidgetDirty(instanceId, pattern.length > 0 || text.length > 0)

  const toggleFlag = (flag: string) => {
    setFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    )
  }

  const { regex, error } = useMemo(() => {
    if (!pattern) return { regex: null, error: null as string | null }
    try {
      return { regex: new RegExp(pattern, flags.join('')), error: null }
    } catch (err) {
      return {
        regex: null,
        error: err instanceof Error ? err.message : 'Invalid pattern',
      }
    }
  }, [pattern, flags])

  const matches = useMemo(() => {
    if (!regex || !text) return []
    if (!regex.global) {
      const match = regex.exec(text)
      return match ? [match] : []
    }
    return Array.from(text.matchAll(regex))
  }, [regex, text])

  const segments = useMemo<Segment[]>(() => {
    if (matches.length === 0) return [{ text, isMatch: false }]
    const parts: Segment[] = []
    let cursor = 0
    for (const match of matches) {
      const index = match.index ?? 0
      if (index > cursor)
        parts.push({ text: text.slice(cursor, index), isMatch: false })
      parts.push({ text: match[0], isMatch: true })
      cursor = index + match[0].length
      if (match[0].length === 0) break // avoid infinite growth on zero-width matches
    }
    if (cursor < text.length)
      parts.push({ text: text.slice(cursor), isMatch: false })
    return parts
  }, [matches, text])

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">/</span>
        <Input
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          placeholder="pattern"
          spellCheck={false}
          className="min-w-0 flex-1 font-mono"
        />
        <span className="text-muted-foreground">/</span>
        {FLAG_OPTIONS.map((flag) => {
          const active = flags.includes(flag)
          return (
            <Button
              key={flag}
              type="button"
              onClick={() => toggleFlag(flag)}
              aria-pressed={active}
              className={cn(
                'h-auto rounded px-1.5 py-1 font-mono',
                active
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
              )}
            >
              {flag}
            </Button>
          )
        })}
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <InputSlot input="text">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Test string…"
          spellCheck={false}
          className="h-16 w-full resize-none p-2 font-mono"
        />
      </InputSlot>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background p-2 font-mono dark:bg-muted/40">
        {!error &&
          segments.map((segment, index) =>
            segment.isMatch ? (
              <mark
                key={index}
                className="rounded bg-highlight px-0.5 dark:bg-highlight/40"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
      </div>
      {matches.length > 0 && (
        <p className="text-muted-foreground">
          {matches.length} match{matches.length === 1 ? '' : 'es'}
        </p>
      )}
    </div>
  )
}

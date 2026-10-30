import { useMemo } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { InputSlot, OutputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetOutput } from '@/connectors/useWidgetOutput'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'

type Direction = 'encode' | 'decode'
type Mode = 'component' | 'full-uri'

export default function UrlEncoderWidget({ instanceId }: WidgetProps) {
  const [direction, setDirection] = useWidgetState<Direction>(instanceId, 'direction', 'encode')
  const [mode, setMode] = useWidgetState<Mode>(instanceId, 'mode', 'component')
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  useWidgetDirty(instanceId, input.length > 0)

  const { output, error } = useMemo(() => {
    if (!input) return { output: '', error: null as string | null }
    try {
      const encodeFn = mode === 'component' ? encodeURIComponent : encodeURI
      const decodeFn = mode === 'component' ? decodeURIComponent : decodeURI
      return {
        output: direction === 'encode' ? encodeFn(input) : decodeFn(input),
        error: null,
      }
    } catch {
      return { output: '', error: 'Invalid input for decoding' }
    }
  }, [input, direction, mode])
  useWidgetOutput(instanceId, output)

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={direction}
          onChange={setDirection}
          options={[
            { label: 'Encode', value: 'encode' },
            { label: 'Decode', value: 'decode' },
          ]}
        />
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { label: 'Component', value: 'component' },
            { label: 'Full URI', value: 'full-uri' },
          ]}
        />
      </div>
      <InputSlot input="input" className="flex flex-1 flex-col">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            direction === 'encode' ? 'Text or URL to encode…' : 'URL to decode…'
          }
          spellCheck={false}
          className="h-16 w-full flex-1 resize-none p-2 font-mono text-xs"
        />
      </InputSlot>
      <OutputSlot className="flex-1">
        <Textarea
          readOnly
          value={error ?? output}
          placeholder="Output"
          spellCheck={false}
          className={cn(
            'h-16 w-full resize-none p-2 pr-14 font-mono text-xs',
            error
              ? 'border-destructive bg-destructive/10 text-destructive'
              : 'border-border bg-background dark:bg-muted/40',
          )}
        />
        {!error && (
          <CopyButton
            value={output}
            className="absolute right-1 top-1 bg-inherit"
          />
        )}
      </OutputSlot>
    </div>
  )
}

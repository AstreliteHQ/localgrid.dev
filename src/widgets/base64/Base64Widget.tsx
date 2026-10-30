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

/** Unicode-safe base64 encode: text -> UTF-8 bytes -> base64. */
function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

/** Unicode-safe base64 decode: base64 -> UTF-8 bytes -> text. */
function decodeBase64(input: string): string {
  const binary = atob(input)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder(undefined, { fatal: false }).decode(bytes)
}

export default function Base64Widget({ instanceId }: WidgetProps) {
  const [direction, setDirection] = useWidgetState<Direction>(instanceId, 'direction', 'encode')
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  useWidgetDirty(instanceId, input.length > 0)

  const { output, error } = useMemo(() => {
    if (!input) return { output: '', error: null as string | null }
    try {
      const result =
        direction === 'encode' ? encodeBase64(input) : decodeBase64(input)
      return { output: result, error: null }
    } catch {
      return {
        output: '',
        error:
          direction === 'encode'
            ? 'Could not encode input'
            : 'Invalid base64 input',
      }
    }
  }, [input, direction])
  useWidgetOutput(instanceId, output)

  return (
    <div className="flex h-full flex-col gap-2">
      <SegmentedControl
        value={direction}
        onChange={setDirection}
        options={[
          { label: 'Encode', value: 'encode' },
          { label: 'Decode', value: 'decode' },
        ]}
      />
      <InputSlot input="input" className="flex flex-1 flex-col">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            direction === 'encode' ? 'Text to encode…' : 'Base64 to decode…'
          }
          spellCheck={false}
          className="h-20 w-full flex-1 resize-none p-2 font-mono text-xs"
        />
      </InputSlot>
      <OutputSlot className="flex-1">
        <Textarea
          readOnly
          value={error ?? output}
          placeholder="Output"
          spellCheck={false}
          className={cn(
            'h-20 w-full resize-none p-2 pr-14 font-mono text-xs',
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

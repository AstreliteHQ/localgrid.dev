import { useMemo } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { CodeEditor } from '@/components/CodeEditor'
import { Textarea } from '@/components/ui/textarea'
import { InputSlot, OutputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetOutput } from '@/connectors/useWidgetOutput'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { convert, type Direction } from './yamlJsonConvert'

export default function YamlJsonConverterWidget({ instanceId }: WidgetProps) {
  const [direction, setDirection] = useWidgetState<Direction>(instanceId, 'direction', 'json-to-yaml')
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  useWidgetDirty(instanceId, input.length > 0)

  const { output, error } = useMemo(() => convert(input, direction), [input, direction])
  useWidgetOutput(instanceId, error ? '' : output)
  const sourceLabel = direction === 'json-to-yaml' ? 'JSON' : 'YAML'
  const targetLabel = direction === 'json-to-yaml' ? 'YAML' : 'JSON'

  return (
    <div className="flex h-full flex-col gap-2">
      <SegmentedControl
        value={direction}
        onChange={setDirection}
        options={[
          { label: 'JSON → YAML', value: 'json-to-yaml' },
          { label: 'YAML → JSON', value: 'yaml-to-json' },
        ]}
      />
      <InputSlot input="input" className="flex min-h-0 flex-1 flex-col">
        <CodeEditor
          value={input}
          onChange={setInput}
          // No YAML grammar is wired into CodeEditor, so the YAML side falls
          // back to plaintext (still gets line wrapping, just no highlighting).
          language={direction === 'json-to-yaml' ? 'json' : 'plaintext'}
          placeholder={`Paste ${sourceLabel}…`}
          aria-label={`${sourceLabel} input`}
          className="min-h-0 flex-1"
        />
      </InputSlot>
      <OutputSlot className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background p-2 dark:bg-muted/40">
          {error ? (
            <ErrorMessage>{error}</ErrorMessage>
          ) : !output ? (
            <p className="text-xs text-muted-foreground">Output will appear here</p>
          ) : (
            <Textarea
              readOnly
              value={output}
              spellCheck={false}
              aria-label={`${targetLabel} output`}
              className="h-full w-full resize-none border-0 bg-transparent p-0 pr-14 font-mono text-xs"
            />
          )}
          {!error && output && <CopyButton value={output} className="absolute right-1 top-1 bg-inherit" />}
        </div>
      </OutputSlot>
    </div>
  )
}

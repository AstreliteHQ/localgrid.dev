import { useMemo } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { ReuseButton } from '@/components/ReuseButton'
import { SplitDirectionToggle, SplitPane, type SplitDirection } from '@/components/SplitPane'
import { ErrorMessage } from '@/components/ErrorMessage'
import { CodeEditor } from '@/components/CodeEditor'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { Textarea } from '@/components/ui/textarea'
import { InputSlot, OutputSlot } from '@/flow/FlowSlots'
import { useWidgetOutput } from '@/flow/useWidgetOutput'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  carryInputAcross,
  formatToml,
  inputFormatOf,
  jsonToToml,
  parseTomlDocument,
  type TomlMode,
} from './tomlConvert'

/** A small project manifest that shows off what TOML has and JSON lacks:
 * comments, dotted keys, dates, tables and an array of tables. */
const SAMPLE = `# Project manifest
name = "localgrid"
version = "0.10.0"
released = 2024-03-18T09:24:00Z
private = false
keywords = ["devtools", "browser", "widgets"]

[build]
target = "es2022"
minify = true
chunks.max-size = 500

[[contributors]]
name = "Ada"
role = "maintainer"

[[contributors]]
name = "Linus"
role = "reviewer"
`

const DEFAULT_MODE: TomlMode = 'tree'

export default function TomlFormatterWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', SAMPLE)
  const [mode, setMode] = useWidgetState<TomlMode>(instanceId, 'mode', DEFAULT_MODE)
  const [splitDirection, setSplitDirection] = useWidgetState<SplitDirection>(instanceId, 'splitDirection', 'rows')
  const [splitRatio, setSplitRatio] = useWidgetState(instanceId, 'splitRatio', 0.5)
  useWidgetDirty(instanceId, input !== SAMPLE)

  const inputFormat = inputFormatOf(mode)
  const parsed = useMemo(() => (mode === 'tree' || mode === 'json' ? parseTomlDocument(input) : null), [input, mode])

  const { output, error } = useMemo(() => {
    if (mode === 'from-json') return jsonToToml(input)
    // Formatted mode parses on its own (BigInt integers), so it must not be
    // gated on the JSON-oriented parse, which rejects integers beyond 2^53.
    if (mode === 'toml') return formatToml(input)
    if (!parsed || parsed.error) return { output: '', error: parsed?.error ?? null }
    if (!parsed.data) return { output: '', error: null }
    // Tree mode still publishes JSON so a connected widget gets something
    // useful downstream.
    return { output: JSON.stringify(parsed.data, null, 2), error: null }
  }, [mode, input, parsed])
  useWidgetOutput(instanceId, output)

  const tree = useMemo(() => (mode === 'tree' && parsed?.data ? buildJsonTree(parsed.data) : null), [mode, parsed])

  const changeMode = (next: TomlMode) => {
    setInput(carryInputAcross(input, mode, next))
    setMode(next)
  }

  // Reusing a converted output flips the direction too, since the input
  // editor then holds the other format.
  const reuse = (value: string) => {
    setInput(value)
    if (mode === 'json') setMode('from-json')
    else if (mode === 'from-json') setMode('json')
  }

  const sourceLabel = inputFormat === 'toml' ? 'TOML' : 'JSON'
  const targetLabel = mode === 'json' ? 'JSON' : 'TOML'

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={mode}
          onChange={changeMode}
          options={[
            { label: 'Tree', value: 'tree' },
            { label: 'Formatted', value: 'toml' },
            { label: 'To JSON', value: 'json' },
            { label: 'From JSON', value: 'from-json' },
          ]}
        />
        <SplitDirectionToggle value={splitDirection} onChange={setSplitDirection} className="ml-auto" />
      </div>
      <SplitPane
        direction={splitDirection}
        ratio={splitRatio}
        onRatioChange={setSplitRatio}
        label="Resize input and output"
        className="flex-1"
        first={
          <InputSlot input="input" className="flex min-h-0 flex-1 flex-col">
            <CodeEditor
              value={input}
              onChange={setInput}
              language={inputFormat}
              placeholder={`Paste ${sourceLabel}…`}
              aria-label={`${sourceLabel} input`}
              className="min-h-0 flex-1"
            />
          </InputSlot>
        }
        second={
          <OutputSlot className="flex min-h-0 flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background p-2 dark:bg-muted/40">
              {error ? (
                <div className="min-h-0 flex-1 overflow-auto">
                  <ErrorMessage>
                    <span className="whitespace-pre-wrap font-mono">{error}</span>
                  </ErrorMessage>
                </div>
              ) : !output ? (
                <p className="text-xs text-muted-foreground">Output will appear here</p>
              ) : tree ? (
                <DataTree root={tree} label="TOML tree" className="flex-1" />
              ) : (
                <>
                  <div className="-mr-1 -mt-1 flex shrink-0 justify-end gap-0.5">
                    <ReuseButton value={output} onReuse={reuse} direction={splitDirection} />
                    <CopyButton value={output} />
                  </div>
                  <Textarea
                    readOnly
                    value={output}
                    spellCheck={false}
                    aria-label={`${targetLabel} output`}
                    className="min-h-0 w-full flex-1 resize-none overflow-auto border-0 bg-transparent p-0 font-mono text-xs"
                  />
                </>
              )}
            </div>
          </OutputSlot>
        }
      />
    </div>
  )
}

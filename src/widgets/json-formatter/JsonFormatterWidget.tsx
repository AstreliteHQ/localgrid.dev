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
import { InputSlot, OutputSlot } from '@/connectors/ConnectorSlots'
import { useWidgetOutput } from '@/connectors/useWidgetOutput'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'

type ViewMode = 'plain' | 'tree' | 'pretty' | 'minified'

/** Sample chosen to exercise what the tree view can show: a well-known id,
 * a URL, a timestamp, a hex color, a homogeneous array, and a nested
 * object, so the widget demonstrates itself on first open. */
const SAMPLE = `{
  "id": "8f14e45f-ea8b-4f1e-9c0a-2b6d7c3e5a91",
  "name": "localgrid",
  "url": "https://localgrid.dev",
  "createdAt": "2024-03-18T09:24:00Z",
  "stars": 1284,
  "archived": false,
  "license": null,
  "theme": { "accent": "#38bdf8", "mode": "dark" },
  "tags": ["json", "xml", "devtools"]
}`

export default function JsonFormatterWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', SAMPLE)
  const [viewMode, setViewMode] = useWidgetState<ViewMode>(instanceId, 'viewMode', 'plain')
  const [splitDirection, setSplitDirection] = useWidgetState<SplitDirection>(instanceId, 'splitDirection', 'rows')
  const [splitRatio, setSplitRatio] = useWidgetState(instanceId, 'splitRatio', 0.5)
  useWidgetDirty(instanceId, input !== SAMPLE)

  const { data, error } = useMemo(() => {
    if (!input.trim()) return { data: undefined as unknown, error: null as string | null }
    try {
      return { data: JSON.parse(input) as unknown, error: null }
    } catch (err) {
      return {
        data: undefined,
        error: err instanceof Error ? err.message : 'Invalid JSON',
      }
    }
  }, [input])

  const hasData = !error && data !== undefined
  const isTreeRenderable = hasData && typeof data === 'object' && data !== null

  const formattedOutput = useMemo(() => {
    if (!hasData) return ''
    return viewMode === 'minified' ? JSON.stringify(data) : JSON.stringify(data, null, 2)
  }, [data, hasData, viewMode])
  useWidgetOutput(instanceId, formattedOutput)

  // Rebuilt on every keystroke, which is cheap (the walk is linear and holds
  // the parsed values by reference) — and DataTree keys its expansion and
  // selection state on stable node paths, so nothing collapses while typing.
  const tree = useMemo(() => (isTreeRenderable ? buildJsonTree(data) : null), [data, isTreeRenderable])

  const showTree = viewMode === 'tree' && tree !== null

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          options={[
            { label: 'Plain', value: 'plain' },
            { label: 'Tree', value: 'tree' },
            { label: 'Pretty', value: 'pretty' },
            { label: 'Minified', value: 'minified' },
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
            {/* Plain mode has no output pane, so the editor also marks the output. */}
            {viewMode === 'plain' && <OutputSlot className="absolute inset-0" />}
            <CodeEditor
              value={input}
              onChange={setInput}
              language="json"
              placeholder="Paste JSON…"
              aria-label="JSON input"
              className="min-h-0 flex-1"
            />
          </InputSlot>
        }
        second={
          viewMode !== 'plain' && (
            <OutputSlot className="flex min-h-0 flex-1 flex-col">
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background p-2 dark:bg-muted/40">
                {error ? (
                  <ErrorMessage>{error}</ErrorMessage>
                ) : !hasData ? (
                  <p className="text-xs text-muted-foreground">Output will appear here</p>
                ) : showTree ? (
                  <DataTree root={tree} label="JSON tree" className="flex-1" />
                ) : (
                  <>
                    <div className="-mr-1 -mt-1 flex shrink-0 justify-end gap-0.5">
                      <ReuseButton value={formattedOutput} onReuse={setInput} direction={splitDirection} />
                      <CopyButton value={formattedOutput} />
                    </div>
                    <Textarea
                      readOnly
                      value={formattedOutput}
                      spellCheck={false}
                      aria-label="JSON output"
                      className="min-h-0 w-full flex-1 resize-none overflow-auto border-0 bg-transparent p-0 font-mono text-xs"
                    />
                  </>
                )}
              </div>
            </OutputSlot>
          )
        }
      />
    </div>
  )
}

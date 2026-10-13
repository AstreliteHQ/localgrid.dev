import { useMemo } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { ReuseButton } from '@/components/ReuseButton'
import { SplitDirectionToggle, SplitPane, type SplitDirection } from '@/components/SplitPane'
import { ErrorMessage } from '@/components/ErrorMessage'
import { CodeEditor } from '@/components/CodeEditor'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildXmlTree } from '@/components/data-tree/treeModel'
import { Textarea } from '@/components/ui/textarea'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { minifyXml, parseXml, prettyPrintXml } from './xmlFormat'

type ViewMode = 'plain' | 'tree' | 'pretty' | 'minified'

/** Sample chosen to exercise the tree view: attributes, repeated sibling
 * tags, a comment, and text-only leaves, so the widget demonstrates itself
 * on first open. */
const SAMPLE = `<catalog updated="2024-03-18">
  <!-- two entries -->
  <book id="bk101" price="29.99">
    <title>XML Developer's Guide</title>
    <author>Gambardella, Matthew</author>
  </book>
  <book id="bk102" price="12.50">
    <title>Midnight Rain</title>
    <author>Ralls, Kim</author>
  </book>
</catalog>`

export default function XmlFormatterWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', SAMPLE)
  const [viewMode, setViewMode] = useWidgetState<ViewMode>(instanceId, 'viewMode', 'plain')
  const [splitDirection, setSplitDirection] = useWidgetState<SplitDirection>(instanceId, 'splitDirection', 'rows')
  const [splitRatio, setSplitRatio] = useWidgetState(instanceId, 'splitRatio', 0.5)
  useWidgetDirty(instanceId, input !== SAMPLE)

  const { doc, error } = useMemo(() => {
    if (!input.trim()) return { doc: null as Document | null, error: null as string | null }
    return parseXml(input)
  }, [input])

  const hasData = !error && doc !== null

  const formattedOutput = useMemo(() => {
    if (!hasData || !doc) return ''
    return viewMode === 'minified' ? minifyXml(input, doc) : prettyPrintXml(input, doc)
  }, [doc, hasData, input, viewMode])

  // Built straight off the parsed DOM rather than through a JSON conversion,
  // so elements, attributes, text, and comments each keep their own identity
  // in the tree instead of collapsing into `@attr`/`#text` object keys.
  const tree = useMemo(() => (hasData && doc ? buildXmlTree(doc) : null), [doc, hasData])

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
          <CodeEditor
            value={input}
            onChange={setInput}
            language="xml"
            placeholder="Paste XML…"
            aria-label="XML input"
            className="min-h-0 flex-1"
          />
        }
        second={
          viewMode !== 'plain' && (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background p-2 dark:bg-muted/40">
              {error ? (
                <ErrorMessage>{error}</ErrorMessage>
              ) : !hasData ? (
                <p className="text-xs text-muted-foreground">Output will appear here</p>
              ) : showTree ? (
                <DataTree root={tree} label="XML tree" className="flex-1" />
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
                    aria-label="XML output"
                    className="min-h-0 w-full flex-1 resize-none overflow-auto border-0 bg-transparent p-0 font-mono text-xs"
                  />
                </>
              )}
            </div>
          )
        }
      />
    </div>
  )
}

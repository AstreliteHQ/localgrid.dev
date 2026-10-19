import { useId, useMemo } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { CodeEditor } from '@/components/CodeEditor'
import { SplitPane } from '@/components/SplitPane'
import { Button } from '@/components/ui/button'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { parseDocument, type DocumentFormat } from './parseDocument'
import { changesToText, diffDocuments, flattenChanges } from './structuralDiff'
import { ChangeList, DiffTree } from './DiffViews'

type ViewMode = 'changes' | 'tree'

/** Samples differ in key order and formatting on purpose, so the widget
 * shows on first open that only real changes are reported. */
const SAMPLES: Record<DocumentFormat, { original: string; changed: string }> = {
  json: {
    original: `{
  "name": "localgrid",
  "version": "0.6.0",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "keywords": ["json", "yaml", "devtools"]
}`,
    changed: `{
  "version": "0.7.0",
  "name": "localgrid",
  "scripts": {
    "build": "tsc -b && vite build",
    "dev": "vite",
    "test": "vitest run"
  },
  "keywords": ["json", "yaml", "diff", "devtools"]
}`,
  },
  yaml: {
    original: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80`,
    changed: `kind: Deployment
apiVersion: apps/v1
metadata:
  name: web
  labels: { app: web }
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.29
          ports:
            - containerPort: 80`,
  },
}

const FORMAT_LABEL: Record<DocumentFormat, string> = { json: 'JSON', yaml: 'YAML' }

/** Compares two JSON or YAML documents by structure rather than by text:
 * key order, indentation and quoting style don't count as changes, and
 * each change is reported at the path where it happened. Text Diff stays
 * the tool for a line-by-line view. */
export default function JsonYamlDiffWidget({ instanceId }: WidgetProps) {
  const [format, setFormat] = useWidgetState<DocumentFormat>(instanceId, 'format', 'json')
  const [original, setOriginal] = useWidgetState(instanceId, 'original', SAMPLES.json.original)
  const [changed, setChanged] = useWidgetState(instanceId, 'changed', SAMPLES.json.changed)
  const [viewMode, setViewMode] = useWidgetState<ViewMode>(instanceId, 'viewMode', 'changes')
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useWidgetState(instanceId, 'ignoreArrayOrder', false)
  const [splitRatio, setSplitRatio] = useWidgetState(instanceId, 'splitRatio', 0.45)
  const ignoreOrderId = useId()

  const isSample = original === SAMPLES[format].original && changed === SAMPLES[format].changed
  useWidgetDirty(instanceId, !isSample)

  const changeFormat = (next: DocumentFormat) => {
    // Untouched samples follow the format, so YAML mode doesn't open on a
    // JSON example. Anything the user typed is kept as is.
    if (isSample) {
      setOriginal(SAMPLES[next].original)
      setChanged(SAMPLES[next].changed)
    }
    setFormat(next)
  }

  const swap = () => {
    setOriginal(changed)
    setChanged(original)
  }

  const left = useMemo(() => parseDocument(original, format), [original, format])
  const right = useMemo(() => parseDocument(changed, format), [changed, format])

  const diff = useMemo(
    () => (left.ok && right.ok ? diffDocuments(left.value, right.value, { ignoreArrayOrder }) : null),
    [left, right, ignoreArrayOrder],
  )
  const leftError = left.ok ? null : left.error
  const rightError = right.ok ? null : right.error
  const changes = useMemo(() => (diff ? flattenChanges(diff) : []), [diff])
  const identical = diff !== null && changes.length === 0

  const label = FORMAT_LABEL[format]
  const language = format === 'json' ? 'json' : 'plaintext'

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={format}
          onChange={changeFormat}
          options={[
            { label: 'JSON', value: 'json' },
            { label: 'YAML', value: 'yaml' },
          ]}
        />
        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          options={[
            { label: 'Changes', value: 'changes' },
            { label: 'Tree', value: 'tree' },
          ]}
        />
        <label htmlFor={ignoreOrderId} className="flex items-center gap-1.5 text-muted-foreground">
          <input
            id={ignoreOrderId}
            type="checkbox"
            checked={ignoreArrayOrder}
            onChange={(event) => setIgnoreArrayOrder(event.target.checked)}
            className="accent-primary"
          />
          Ignore array order
        </label>
        <div className="ml-auto flex items-center gap-2">
          {diff &&
            (identical ? (
              <span className="text-muted-foreground">No differences</span>
            ) : (
              <span className="flex gap-1 font-mono" aria-label="Change counts">
                {diff.counts.added > 0 && <span className="text-success">+{diff.counts.added}</span>}
                {diff.counts.removed > 0 && <span className="text-destructive">-{diff.counts.removed}</span>}
                {diff.counts.changed > 0 && <span className="text-tree-warn">~{diff.counts.changed}</span>}
              </span>
            ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={swap}
            aria-label="Swap original and changed documents"
            title="Swap original and changed documents"
          >
            <ArrowLeftRight className="size-3.5" />
            Swap
          </Button>
        </div>
      </div>

      <SplitPane
        direction="rows"
        ratio={splitRatio}
        onRatioChange={setSplitRatio}
        label="Resize inputs and diff"
        className="flex-1"
        first={
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            <CodeEditor
              value={original}
              onChange={setOriginal}
              language={language}
              placeholder={`Original ${label}…`}
              aria-label={`Original ${label}`}
              className="min-h-0"
            />
            <CodeEditor
              value={changed}
              onChange={setChanged}
              language={language}
              placeholder={`Changed ${label}…`}
              aria-label={`Changed ${label}`}
              className="min-h-0"
            />
          </div>
        }
        second={
          <div className="relative min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background p-1 dark:bg-muted/40">
            {leftError && <ErrorMessage>Original: {leftError}</ErrorMessage>}
            {rightError && <ErrorMessage>Changed: {rightError}</ErrorMessage>}
            {!diff && !leftError && !rightError && (
              <p className="p-1 text-muted-foreground">Paste a {label} document on both sides to compare them</p>
            )}
            {identical && <p className="p-1 text-muted-foreground">The documents are equivalent</p>}
            {diff && !identical && (
              <>
                {viewMode === 'changes' ? <ChangeList changes={changes} /> : <DiffTree root={diff} />}
                <CopyButton value={changesToText(changes)} className="absolute right-1 top-1 bg-background" />
              </>
            )}
          </div>
        }
      />
    </div>
  )
}

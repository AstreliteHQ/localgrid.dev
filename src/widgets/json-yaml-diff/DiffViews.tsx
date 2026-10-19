import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatValue, type DiffChange, type DiffKind, type DiffNode } from './structuralDiff'

const MAX_VALUE_CHARS = 200
/** Same cap as DataTree: rows are rendered, not virtualized. */
const MAX_ROWS = 2000

const MARKER: Record<DiffKind, string> = {
  added: '+',
  removed: '-',
  changed: '~',
  nested: '',
  unchanged: '',
}

const MARKER_CLASS: Record<DiffKind, string> = {
  added: 'text-success',
  removed: 'text-destructive',
  changed: 'text-tree-warn',
  nested: '',
  unchanged: '',
}

const ROW_CLASS: Record<DiffKind, string> = {
  added: 'bg-success/10',
  removed: 'bg-destructive/10',
  changed: 'bg-tree-warn/10',
  nested: '',
  unchanged: '',
}

function truncate(text: string): string {
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text
}

function Value({ value, tone }: { value: unknown; tone: 'before' | 'after' | 'plain' }) {
  const text = formatValue(value)
  return (
    <span
      title={text}
      className={cn(
        'min-w-0 truncate',
        tone === 'before' && 'text-destructive line-through decoration-destructive/50',
        tone === 'after' && 'text-success',
        tone === 'plain' && 'text-muted-foreground',
      )}
    >
      {truncate(text)}
    </span>
  )
}

/** Old and new value of a change, or the one value of an addition or
 * removal. */
function ChangeValues({ kind, before, after }: { kind: DiffKind; before?: unknown; after?: unknown }) {
  if (kind === 'added') return <Value value={after} tone="after" />
  if (kind === 'removed') return <Value value={before} tone="before" />
  return (
    <>
      <Value value={before} tone="before" />
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        →
      </span>
      <Value value={after} tone="after" />
    </>
  )
}

function Marker({ kind }: { kind: DiffKind }) {
  return (
    <span aria-hidden="true" className={cn('w-3 shrink-0 text-center font-bold', MARKER_CLASS[kind])}>
      {MARKER[kind]}
    </span>
  )
}

export function ChangeList({ changes }: { changes: DiffChange[] }) {
  return (
    <ul aria-label="Changes" className="flex flex-col font-mono text-xs">
      {changes.slice(0, MAX_ROWS).map((change) => (
        <li
          key={`${change.path}#${change.kind}`}
          aria-label={`${change.kind} ${change.path}`}
          className={cn('flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5', ROW_CLASS[change.kind])}
        >
          <Marker kind={change.kind} />
          <span title={change.path} className="max-w-[45%] shrink-0 truncate text-tree-key">
            {change.path}
          </span>
          <ChangeValues kind={change.kind} before={change.before} after={change.after} />
        </li>
      ))}
      {changes.length > MAX_ROWS && (
        <li className="px-1 py-1 font-sans text-muted-foreground">
          {changes.length - MAX_ROWS} more changes not shown
        </li>
      )}
    </ul>
  )
}

interface Row {
  node: DiffNode
  depth: number
  expanded: boolean
}

/** Changed branches open, everything else (untouched branches, whole
 * added or removed subtrees) folded so the changes stand out. */
const defaultExpanded = (node: DiffNode) => node.kind === 'nested'

function containerPreview(node: DiffNode): string {
  const value = node.kind === 'removed' ? node.before : node.after
  const count = node.children.length
  return Array.isArray(value) ? `[${count}]` : `{${count}}`
}

function CountBadge({ node }: { node: DiffNode }) {
  const { added, removed, changed } = node.counts
  return (
    <span className="ml-auto shrink-0 rounded bg-muted px-1 font-sans text-[10px]">
      {added > 0 && <span className="text-success">+{added} </span>}
      {removed > 0 && <span className="text-destructive">-{removed} </span>}
      {changed > 0 && <span className="text-tree-warn">~{changed}</span>}
    </span>
  )
}

/** The merged document as a tree: every key of both sides, with what
 * happened to each. */
export function DiffTree({ root }: { root: DiffNode }) {
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map())

  const rows = useMemo(() => {
    const out: Row[] = []
    const visit = (node: DiffNode, depth: number) => {
      if (out.length >= MAX_ROWS) return
      const expanded = node.children.length > 0 && (overrides.get(node.id) ?? defaultExpanded(node))
      out.push({ node, depth, expanded })
      if (expanded) node.children.forEach((child) => visit(child, depth + 1))
    }
    // A container root is a handle, not a row: its keys are the top level.
    if (root.children.length > 0 && root.kind !== 'changed') root.children.forEach((child) => visit(child, 0))
    else visit(root, 0)
    return out
  }, [root, overrides])

  const toggle = (row: Row) => setOverrides((current) => new Map(current).set(row.node.id, !row.expanded))

  return (
    <ul role="tree" aria-label="Diff tree" className="flex flex-col font-mono text-xs">
      {rows.map((row) => {
        const { node } = row
        const expandable = node.children.length > 0
        return (
          <li
            key={node.id}
            role="treeitem"
            aria-expanded={expandable ? row.expanded : undefined}
            aria-label={`${node.kind} ${node.path}`}
            style={{ paddingLeft: `${row.depth * 12 + 4}px` }}
            className={cn('flex min-w-0 items-center gap-1 rounded py-0.5 pr-1', ROW_CLASS[node.kind])}
          >
            {expandable ? (
              <button
                type="button"
                onClick={() => toggle(row)}
                aria-label={row.expanded ? `Collapse ${node.path}` : `Expand ${node.path}`}
                className="shrink-0 rounded text-muted-foreground hover:text-foreground"
              >
                {row.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </button>
            ) : (
              <span aria-hidden="true" className="w-3 shrink-0" />
            )}
            <Marker kind={node.kind} />
            <span
              className={cn(
                'shrink-0 whitespace-nowrap',
                typeof node.key === 'number' ? 'text-muted-foreground' : 'text-tree-key',
              )}
            >
              {node.key ?? '$'}
              <span className="text-tree-punct">:</span>
            </span>
            {expandable ? (
              <>
                <span className="shrink-0 text-tree-punct">{containerPreview(node)}</span>
                {node.kind === 'nested' && <CountBadge node={node} />}
              </>
            ) : node.kind === 'unchanged' || node.kind === 'nested' ? (
              <Value value={node.after} tone="plain" />
            ) : (
              <ChangeValues kind={node.kind} before={node.before} after={node.after} />
            )}
          </li>
        )
      })}
      {rows.length >= MAX_ROWS && (
        <li className="px-1 py-1 font-sans text-muted-foreground">Tree cut at {MAX_ROWS} rows</li>
      )}
    </ul>
  )
}

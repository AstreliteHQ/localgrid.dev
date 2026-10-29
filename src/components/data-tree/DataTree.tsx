import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  Activity,
  Banknote,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FoldVertical,
  GitBranch,
  Hash,
  Image,
  KeyRound,
  Languages,
  Link as LinkIcon,
  Mail,
  MapPin,
  Palette,
  Phone,
  Search,
  Shapes,
  Sigma,
  Tag,
  UnfoldVertical,
  User,
  X,
} from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ID_SEP,
  copyText,
  formatScalar,
  itemKindLabel,
  summarize,
  truncate,
  type TreeNode,
  type TreeNodeKind,
} from './treeModel'
import { describeNode, lengthNote, type HintIcon, type ValueHint } from './valueHints'

const HINT_ICONS: Record<HintIcon, typeof Hash> = {
  id: Hash,
  link: LinkIcon,
  mail: Mail,
  time: Clock,
  secret: KeyRound,
  user: User,
  location: MapPin,
  color: Palette,
  file: FileText,
  image: Image,
  phone: Phone,
  count: Sigma,
  money: Banknote,
  version: GitBranch,
  status: Activity,
  type: Shapes,
  language: Languages,
  name: Tag,
}

/** Value colors are their own palette (see the `--tree-*` tokens in
 * index.css) rather than the app's semantic roles: syntax coloring needs
 * hues that separate types at a glance, which `muted`/`accent` can't
 * express. */
const VALUE_CLASS: Record<TreeNodeKind, string> = {
  string: 'text-tree-string',
  number: 'text-tree-number',
  boolean: 'text-tree-boolean',
  null: 'text-tree-null italic',
  text: 'text-tree-string',
  cdata: 'text-tree-string',
  attribute: 'text-tree-string',
  element: 'text-tree-string',
  comment: 'text-tree-comment italic',
  instruction: 'text-tree-comment italic',
  object: 'text-tree-punct',
  array: 'text-tree-punct',
  document: 'text-tree-punct',
}

/** How many levels open on first render: enough that a typical document is
 * readable at a glance, fewer once it is big enough that opening it wide
 * would bury the structure in rows. */
const AUTO_DEPTH_LARGE = 2
const AUTO_DEPTH_SMALL = 3
const LARGE_TREE_NODES = 300
const MAX_VALUE_CHARS = 200
/** Rows are rendered, not virtualized. A document big enough to blow past
 * this is not readable by scrolling anyway, so the tail is cut and the user
 * is pointed at the filter instead of at a frozen tab. */
const MAX_ROWS = 2000

type ExpandMode = 'auto' | 'all' | 'none'

interface DataTreeProps {
  root: TreeNode
  /** Accessible name for the tree, e.g. "JSON tree". */
  label: string
  /** Filter box and expand/collapse controls. Off for small embedded trees
   * (the JWT decoder's header/payload blocks) where they would outweigh the
   * few rows they control. */
  toolbar?: boolean
  /** Path/statistics bar along the bottom. */
  statusBar?: boolean
  /** Whether the tree scrolls inside its own box. Off when the tree should
   * grow to its natural height and let an outer container scroll. */
  scroll?: boolean
  className?: string
}

interface Row {
  node: TreeNode
  expanded: boolean
  expandable: boolean
}

function matchText(node: TreeNode): string {
  const value = node.value === undefined ? '' : formatScalar(node.kind, node.value)
  return `${node.label} ${value}`.toLowerCase()
}

/** Ids of every node that survives the filter: the matches themselves plus
 * the ancestors needed to reach them, so a match deep in a document stays
 * readable in context instead of appearing as a rootless row. */
function filterIds(root: TreeNode, query: string): Set<string> {
  const needle = query.trim().toLowerCase()
  const keep = new Set<string>()
  const walk = (node: TreeNode, trail: TreeNode[]) => {
    if (matchText(node).includes(needle)) {
      for (const ancestor of trail) keep.add(ancestor.id)
      keep.add(node.id)
    }
    const nextTrail = [...trail, node]
    for (const child of node.children) walk(child, nextTrail)
  }
  for (const child of root.children) walk(child, [])
  return keep
}

/** Compact per-node statistics: how much is inside a container, how long a
 * value is. Rendered as a badge so a collapsed node still says how big it
 * is without being expanded. */
function statsBadge(node: TreeNode): string | null {
  const { children, itemKind } = node.stats
  if (node.kind === 'array') {
    const noun = itemKindLabel(itemKind, children)
    return children === 0 ? 'empty' : `${children} ${noun ?? (children === 1 ? 'item' : 'items')}`
  }
  if (node.kind === 'object') {
    return children === 0 ? 'empty' : `${children} ${children === 1 ? 'key' : 'keys'}`
  }
  if (node.kind === 'element' || node.kind === 'document') {
    const attrs = node.children.filter((child) => child.kind === 'attribute').length
    const elements = children - attrs
    const parts: string[] = []
    if (attrs) parts.push(`${attrs} ${attrs === 1 ? 'attr' : 'attrs'}`)
    if (elements) parts.push(`${elements} ${elements === 1 ? 'child' : 'children'}`)
    return parts.length ? parts.join(' · ') : null
  }
  return lengthNote(node.kind, node.value)
}

/** Full stat line for the selected node, where there is room for the
 * numbers a badge has to leave out. */
function statsLine(node: TreeNode): string {
  const parts: string[] = [node.kind]
  if (node.stats.children) parts.push(`${node.stats.children} direct`)
  if (node.stats.descendants > node.stats.children) parts.push(`${node.stats.descendants} total`)
  if (node.stats.depth) parts.push(`depth ${node.stats.depth}`)
  const length = lengthNote(node.kind, node.value, 1)
  if (length) parts.push(length)
  return parts.join(' · ')
}

/** Trims a long value for display, keeping the filter match inside what is
 * shown. Truncating from the start alone can leave a row that matched the
 * filter displaying no highlight at all, which reads as a false positive. */
function valuePreview(text: string, query: string, max: number): string {
  if (text.length <= max) return text
  const needle = query.trim().toLowerCase()
  const at = needle ? text.toLowerCase().indexOf(needle) : -1
  if (at === -1 || at + needle.length <= max) return truncate(text, max)
  const lead = Math.max(0, Math.floor((max - needle.length) / 2))
  const start = Math.min(Math.max(0, at - lead), text.length - max)
  const end = start + max
  return `…${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase()
  if (!needle) return <>{text}</>
  const index = text.toLowerCase().indexOf(needle)
  if (index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[2px] bg-highlight text-foreground">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

/** Interactive tree for any structured document (see treeModel for how JSON
 * and XML both reach this shape). Beyond collapse/expand it does three
 * things a plain viewer doesn't: hovering a row lights up its ancestor
 * spine and its whole subtree, every container carries its own size
 * statistics, and well-known fields get an icon and a decoded annotation
 * (see valueHints). */
export function DataTree({ root, label, toolbar = true, statusBar = true, scroll = true, className }: DataTreeProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<ExpandMode>('auto')
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const summary = useMemo(() => summarize(root), [root])
  const autoDepth = summary.nodes > LARGE_TREE_NODES ? AUTO_DEPTH_LARGE : AUTO_DEPTH_SMALL
  const filtered = useMemo(() => (query.trim() ? filterIds(root, query) : null), [root, query])

  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (out.length >= MAX_ROWS) return
        if (filtered && !filtered.has(node.id)) continue
        const children = filtered ? node.children.filter((child) => filtered.has(child.id)) : node.children
        const expandable = children.length > 0
        // A filtered view expands everything it kept: a match the user has
        // to go hunting for behind a collapsed parent defeats the search.
        const expanded =
          expandable &&
          (filtered
            ? true
            : (overrides[node.id] ?? (mode === 'all' ? true : mode === 'none' ? false : node.depth < autoDepth)))
        out.push({ node, expanded, expandable })
        if (expanded) walk(children)
      }
    }
    walk(root.children)
    return out
  }, [root, filtered, overrides, mode, autoDepth])

  const truncated = rows.length >= MAX_ROWS

  const selectedNode = useMemo(() => rows.find((row) => row.node.id === selected)?.node ?? null, [rows, selected])

  /** Every id from the root down to the hovered row. A row lights the indent
   * guide of any level in this set, so the branch the pointer is in reads as
   * one continuous vertical line instead of a lone tinted row. */
  const hoveredSpine = useMemo(() => {
    const node = hovered ? rows.find((row) => row.node.id === hovered)?.node : null
    return node ? new Set([...node.ancestors, node.id]) : null
  }, [rows, hovered])

  /** Expansion is stored as an override per node rather than as the state
   * itself, so the default rule (and "expand all" / "collapse all") keeps
   * applying to everything untouched, and so state survives the tree being
   * rebuilt on every keystroke. The caller passes the target state, since
   * only the row knows what it is currently showing. */
  const toggle = useCallback((node: TreeNode, next: boolean) => {
    setOverrides((prev) => ({ ...prev, [node.id]: next }))
  }, [])

  const focusRow = useCallback((id: string | null) => {
    if (!id) return
    setSelected(id)
    rowRefs.current.get(id)?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = rows.findIndex((row) => row.node.id === selected)
    const row = index >= 0 ? rows[index] : null
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(rows[Math.min(index + 1, rows.length - 1)]?.node.id ?? rows[0]?.node.id ?? null)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(rows[Math.max(index - 1, 0)]?.node.id ?? null)
        break
      case 'ArrowRight':
        if (!row) break
        event.preventDefault()
        if (row.expandable && !row.expanded) toggle(row.node, true)
        else focusRow(rows[index + 1]?.node.id ?? null)
        break
      case 'ArrowLeft': {
        if (!row) break
        event.preventDefault()
        if (row.expandable && row.expanded) {
          toggle(row.node, false)
          break
        }
        const parentId = row.node.ancestors[row.node.ancestors.length - 1]
        focusRow(rows.find((candidate) => candidate.node.id === parentId)?.node.id ?? null)
        break
      }
      case 'Enter':
      case ' ':
        if (!row?.expandable) break
        event.preventDefault()
        toggle(row.node, !row.expanded)
        break
      case 'Home':
        event.preventDefault()
        focusRow(rows[0]?.node.id ?? null)
        break
      case 'End':
        event.preventDefault()
        focusRow(rows[rows.length - 1]?.node.id ?? null)
        break
      default:
        break
    }
  }

  const registerRow = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) rowRefs.current.set(id, element)
    else rowRefs.current.delete(id)
  }, [])

  return (
    <div className={cn('flex min-h-0 flex-col gap-1.5', className)}>
      {toolbar && (
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter keys and values…"
              aria-label={`Filter ${label}`}
              className="h-7 w-full pl-6 pr-6 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear filter"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Expand all"
            title="Expand all"
            onClick={() => {
              setMode('all')
              setOverrides({})
            }}
          >
            <UnfoldVertical className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse all"
            title="Collapse all"
            onClick={() => {
              setMode('none')
              setOverrides({})
            }}
          >
            <FoldVertical className="size-3.5" />
          </Button>
        </div>
      )}

      <div
        role="tree"
        aria-label={label}
        // Keyed on the row that is actually rendered, not on the stored id:
        // once filtering or collapsing hides the selection, no row carries
        // tabIndex 0 any more, and a tree that kept -1 here would drop out of
        // the tab order entirely.
        tabIndex={selectedNode ? -1 : 0}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHovered(null)}
        className={cn(
          'font-mono text-xs leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
          scroll && 'min-h-0 flex-1 overflow-auto',
        )}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-2 font-sans text-xs text-muted-foreground">
            {query ? `No key or value matches "${query.trim()}"` : 'Nothing to show'}
          </p>
        ) : (
          rows.map((row) => (
            <TreeRow
              key={row.node.id}
              row={row}
              query={query}
              hovered={hovered}
              hoveredSpine={hoveredSpine}
              selected={selected === row.node.id}
              onHover={setHovered}
              onSelect={setSelected}
              onToggle={toggle}
              registerRow={registerRow}
            />
          ))
        )}
        {truncated && (
          <p className="px-1 py-2 font-sans text-xs text-muted-foreground">
            Showing the first {MAX_ROWS.toLocaleString('en-US')} rows. Collapse a branch or filter to narrow this down.
          </p>
        )}
      </div>

      {statusBar && (
        <div className="flex items-center gap-1 border-t border-border pt-1 font-sans text-[11px] text-muted-foreground">
          {selectedNode ? (
            <>
              <span className="truncate font-mono text-foreground" title={selectedNode.path}>
                {selectedNode.path}
              </span>
              <span className="shrink-0">{statsLine(selectedNode)}</span>
              <div className="ml-auto flex shrink-0 items-center">
                {/* Two copy actions side by side, so each carries a short
                 * label: icon-only they looked identical. */}
                <CopyButton value={selectedNode.path} label="Path" className="px-1 py-0.5" />
                <CopyButton value={copyText(selectedNode)} label="Value" className="px-1 py-0.5" />
              </div>
            </>
          ) : (
            <>
              <span className="truncate">{summaryLine(summary, rows.length, Boolean(filtered))}</span>
              {/* With no row selected the same slot copies the whole document,
               * so tree view never loses the plain "copy everything" the other
               * views offer. */}
              <CopyButton
                value={copyText(root)}
                label=""
                ariaLabel="Copy all"
                className="ml-auto shrink-0 px-1 py-0.5"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function summaryLine(summary: ReturnType<typeof summarize>, visible: number, filtering: boolean): string {
  const parts: string[] = []
  if (summary.objects) parts.push(`${summary.objects} obj`)
  if (summary.arrays) parts.push(`${summary.arrays} arr`)
  if (summary.elements) parts.push(`${summary.elements} el`)
  if (summary.attributes) parts.push(`${summary.attributes} attr`)
  if (summary.values) parts.push(`${summary.values} ${summary.values === 1 ? 'value' : 'values'}`)
  parts.push(`depth ${summary.depth}`)
  const head = filtering ? `${visible} shown of ${summary.nodes} nodes` : `${summary.nodes} nodes`
  return `${head} · ${parts.join(' · ')}`
}

interface TreeRowProps {
  row: Row
  query: string
  hovered: string | null
  hoveredSpine: Set<string> | null
  selected: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onToggle: (node: TreeNode, next: boolean) => void
  registerRow: (id: string, element: HTMLDivElement | null) => void
}

const TreeRow = memo(function TreeRow({
  row,
  query,
  hovered,
  hoveredSpine,
  selected,
  onHover,
  onSelect,
  onToggle,
  registerRow,
}: TreeRowProps) {
  const { node, expanded, expandable } = row
  // Ids are built as parent + separator + segment, so the family relations
  // are prefix tests on a control character no name can contain.
  const isHovered = hovered === node.id
  const isDescendant = !!hovered && node.id.startsWith(hovered + ID_SEP)
  const isAncestor = !!hovered && hovered.startsWith(node.id + ID_SEP)
  const hint = describeNode(node)
  const HintIconComponent = hint.icon ? HINT_ICONS[hint.icon] : null
  const badge = statsBadge(node)
  const isXml = node.kind === 'element' || node.kind === 'attribute'
  const valueText = node.value === undefined ? null : formatScalar(node.kind, node.value)

  return (
    <div
      ref={(element) => registerRow(node.id, element)}
      role="treeitem"
      aria-level={node.depth}
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onMouseEnter={() => onHover(node.id)}
      onFocus={() => onSelect(node.id)}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => expandable && onToggle(node, !expanded)}
      className={cn(
        'flex w-full items-center gap-1 rounded-sm pr-1 outline-none transition-colors',
        // Three tints, weakest to strongest: the hovered node's subtree, its
        // ancestor spine, then the row itself.
        isDescendant && 'bg-accent/40',
        isAncestor && 'bg-accent/30',
        isHovered && 'bg-accent',
        selected && 'bg-accent/70 ring-1 ring-ring/50',
      )}
    >
      {/* Indent guides. Guide `i` belongs to the ancestor at that level, and
       * lights up when that ancestor is the hovered node, drawing the line
       * from a parent down through everything under it. */}
      {Array.from({ length: node.depth - 1 }, (_, level) => (
        <span
          key={level}
          aria-hidden="true"
          className={cn(
            'ml-1 h-5 w-2 shrink-0 border-l',
            hoveredSpine?.has(node.ancestors[level + 1]) ? 'border-tree-guide-active' : 'border-tree-guide',
          )}
        />
      ))}

      {expandable ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(node, !expanded)
          }}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
          className="shrink-0 rounded text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
      ) : (
        <span aria-hidden="true" className="w-3 shrink-0" />
      )}

      {HintIconComponent && (
        <HintIconComponent
          aria-hidden="true"
          className={cn('size-3 shrink-0', hint.tone === 'warn' ? 'text-tree-warn' : 'text-muted-foreground')}
        />
      )}

      <NodeLabel node={node} query={query} isXml={isXml} />

      {valueText !== null && <NodeValue node={node} text={valueText} hint={hint} query={query} />}

      {!expanded && expandable && node.preview && (
        <span className="min-w-0 flex-1 truncate text-tree-punct">{node.preview}</span>
      )}

      {badge && (
        <span className="ml-auto shrink-0 rounded bg-muted px-1 font-sans text-[10px] text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  )
})

function NodeLabel({ node, query, isXml }: { node: TreeNode; query: string; isXml: boolean }) {
  // XPath positions are 1-based, and this marker has to agree with the path
  // shown in the status bar for the same row.
  const index =
    node.index !== undefined && isXml ? <span className="text-muted-foreground">[{node.index + 1}]</span> : null

  if (node.kind === 'element') {
    return (
      <span className="shrink-0 whitespace-nowrap">
        <span className="text-tree-punct">&lt;</span>
        <span className="text-tree-tag">
          <Highlight text={node.label} query={query} />
        </span>
        <span className="text-tree-punct">&gt;</span>
        {index}
      </span>
    )
  }
  if (node.kind === 'attribute') {
    return (
      <span className="shrink-0 whitespace-nowrap text-tree-attr">
        <span className="text-tree-punct">@</span>
        <Highlight text={node.label} query={query} />
      </span>
    )
  }
  if (node.kind === 'comment' || node.kind === 'instruction' || node.kind === 'text' || node.kind === 'cdata') {
    return <span className="shrink-0 whitespace-nowrap text-tree-comment">{node.label}</span>
  }
  // A JSON array item is labelled by its position, which reads better dim
  // and bracketed than as another key-coloured name.
  if (node.index !== undefined) {
    return <span className="shrink-0 whitespace-nowrap text-muted-foreground">{node.index}</span>
  }
  return (
    <span className="shrink-0 whitespace-nowrap text-tree-key">
      <Highlight text={node.label} query={query} />
      <span className="text-tree-punct">:</span>
    </span>
  )
}

function NodeValue({
  node,
  text,
  hint,
  query,
}: {
  node: TreeNode
  text: string
  hint: ValueHint
  query: string
}): ReactNode {
  const display = valuePreview(text, query, MAX_VALUE_CHARS)
  const length = lengthNote(node.kind, node.value)

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      {hint.swatch && (
        <span
          aria-hidden="true"
          style={{ background: hint.swatch }}
          className="size-3 shrink-0 rounded-[3px] border border-border"
        />
      )}
      {hint.href ? (
        <a
          href={hint.href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          title={text}
          className={cn('truncate underline decoration-dotted underline-offset-2', VALUE_CLASS[node.kind])}
        >
          <Highlight text={display} query={query} />
        </a>
      ) : (
        <span title={text} className={cn('truncate', VALUE_CLASS[node.kind])}>
          <Highlight text={display} query={query} />
        </span>
      )}
      {hint.note && <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">{hint.note}</span>}
      {length && (
        <span className="shrink-0 whitespace-nowrap rounded bg-muted px-1 font-sans text-[10px] text-muted-foreground">
          {length}
        </span>
      )}
    </span>
  )
}

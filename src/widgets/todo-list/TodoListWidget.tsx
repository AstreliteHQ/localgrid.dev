import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { nanoid } from 'nanoid'
import {
  CircleDot,
  GitPullRequest,
  GripVertical,
  Hash,
  Link2,
  ListTodo,
  Plus,
  Tag,
  Ticket,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetConfig } from '@/widgets/widgetConfig'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { describeRef, parseRef, splitRefs, type RefKind } from './refs'
import { addRefs, countRemaining, createTodoItem, moveItem, type TodoItem } from './todoItem'

type Filter = 'all' | 'open' | 'done'

const DEFAULT_ITEMS: TodoItem[] = []
const DEFAULT_DRAFT = ''
const DEFAULT_FILTER: Filter = 'all'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]
const EMPTY_MESSAGES: Record<Filter, string> = {
  all: 'Nothing on the list yet',
  open: 'No open items',
  done: 'No done items',
}
const DRAG_MIME = 'application/x-localgrid-todo-item'

export default function TodoListWidget({ instanceId }: WidgetProps) {
  // Items are session state by default. "Remember tasks" moves them into
  // configuration, so they survive a reload (and Clear state).
  const [remember, setRemember] = useWidgetConfig(instanceId, 'remember', false)
  const [savedItems, setSavedItems] = useWidgetConfig<TodoItem[]>(instanceId, 'savedItems', DEFAULT_ITEMS)
  const [sessionItems, setSessionItems] = useWidgetState<TodoItem[]>(instanceId, 'items', DEFAULT_ITEMS)
  const items = remember ? savedItems : sessionItems
  const setItems = remember ? setSavedItems : setSessionItems
  const [draft, setDraft] = useWidgetState(instanceId, 'draft', DEFAULT_DRAFT)
  const [filter, setFilter] = useWidgetState<Filter>(instanceId, 'filter', DEFAULT_FILTER)
  // UI-only, like TimelineBuilderWidget's hoveredId/selectedId, so none of
  // these belong in item state or count toward dirtiness.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refDraft, setRefDraft] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // Set by a keyboard move: React may blur the input while reordering nodes.
  const refocusId = useRef<string | null>(null)
  // Remembered items are config, so only session items count as dirty.
  useWidgetDirty(instanceId, sessionItems.length > 0 || draft.trim() !== '')

  useEffect(() => {
    const id = refocusId.current
    if (!id) return
    refocusId.current = null
    listRef.current?.querySelector<HTMLInputElement>(`[data-item-text="${id}"]`)?.focus()
  }, [items])

  const draftId = useId()
  const remaining = countRemaining(items)
  const doneCount = items.length - remaining
  const visible = items.filter((item) => filter === 'all' || item.done === (filter === 'done'))

  const updateItem = (id: string, update: (item: TodoItem) => TodoItem) => {
    setItems((previous) => previous.map((item) => (item.id === id ? update(item) : item)))
  }

  const addItem = () => {
    const item = createTodoItem(nanoid(8), draft)
    if (!item) return
    setItems((previous) => [...previous, item])
    setDraft('')
    // A new item is open, so the Done view would hide it right away.
    if (filter === 'done') setFilter('all')
  }

  // The list moves between state and config, so it never shows twice or
  // vanishes when toggled.
  const toggleRemember = (next: boolean) => {
    if (next) {
      setSavedItems(sessionItems)
      setRemember(true)
      setSessionItems(DEFAULT_ITEMS)
      return
    }
    setSessionItems(savedItems)
    // The setters clear an unpinned overlay's fallback; the reset drops a
    // pinned instance's config so nothing stays saved or shared.
    setRemember(false)
    setSavedItems(DEFAULT_ITEMS)
    useDashboardStore.getState().resetWidgetConfig(instanceId)
  }

  const toggleItem = (id: string) => updateItem(id, (item) => ({ ...item, done: !item.done }))

  const editItem = (id: string, text: string) => updateItem(id, (item) => ({ ...item, text }))

  // Typing may pass through a blank state (clearing the field to retype
  // it), but leaving it blank removes the item, the same rule
  // createTodoItem applies to a new one.
  const commitItemText = (id: string, text: string) => {
    if (text.trim() === '') removeItem(id)
  }

  const removeItem = (id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
    setExpandedId((current) => (current === id ? null : current))
  }

  const clearCompleted = () => {
    setItems((previous) => previous.filter((item) => !item.done))
  }

  const addItemRefs = (id: string, raws: string[]) => updateItem(id, (item) => addRefs(item, raws))

  const removeItemRef = (id: string, raw: string) =>
    updateItem(id, (item) => ({ ...item, refs: item.refs.filter((ref) => ref !== raw) }))

  const toggleEditor = (id: string) => {
    setExpandedId((current) => (current === id ? null : id))
    setRefDraft('')
  }

  const closeEditor = (id: string) => {
    setExpandedId(null)
    setRefDraft('')
    listRef.current?.querySelector<HTMLButtonElement>(`[data-ref-toggle="${id}"]`)?.focus()
  }

  // A paste of several URLs or keys adds each; anything else is one free tag.
  const submitRefDraft = (id: string) => {
    const value = refDraft.trim()
    if (!value) return
    addItemRefs(id, splitRefs(value) ?? [value])
    setRefDraft('')
  }

  // Pasting only links or ticket keys into an item's text attaches them.
  const pasteIntoText = (id: string, event: ClipboardEvent<HTMLInputElement>) => {
    const refs = splitRefs(event.clipboardData.getData('text'))
    if (!refs) return
    event.preventDefault()
    addItemRefs(id, refs)
  }

  // Moves past the next visible item, so a filtered view skips hidden ones.
  const moveByKey = (id: string, event: KeyboardEvent<HTMLInputElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const index = visible.findIndex((item) => item.id === id)
    const neighbor = visible[index + (event.key === 'ArrowUp' ? -1 : 1)]
    if (!neighbor) return
    refocusId.current = id
    setItems((previous) =>
      moveItem(
        previous,
        id,
        previous.findIndex((item) => item.id === neighbor.id),
      ),
    )
  }

  const startDrag = (id: string) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DRAG_MIME, id)
    event.dataTransfer.effectAllowed = 'move'
    const row = event.currentTarget.closest('li')
    if (row) event.dataTransfer.setDragImage(row, 8, 8)
    setDraggingId(id)
  }

  const endDrag = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  // Dropping takes the target's place: below it when dragged down, above
  // it when dragged up.
  const dropOn = (targetId: string) => {
    if (draggingId) {
      const dragged = draggingId
      setItems((previous) =>
        moveItem(
          previous,
          dragged,
          previous.findIndex((item) => item.id === targetId),
        ),
      )
    }
    endDrag()
  }

  const draggingIndex = items.findIndex((item) => item.id === draggingId)

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          addItem()
        }}
        className="flex items-center gap-1"
      >
        <Input
          id={draftId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an item, paste links to attach them…"
          aria-label="New to-do item"
          className="h-7 flex-1 text-xs"
        />
        <Button type="submit" size="icon-sm" variant="outline" disabled={draft.trim() === ''} aria-label="Add item">
          <Plus className="size-3.5" />
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="flex h-full items-center justify-center gap-1.5 text-center text-muted-foreground">
            <ListTodo className="size-3.5 shrink-0" aria-hidden="true" />
            {EMPTY_MESSAGES[items.length === 0 ? 'all' : filter]}
          </p>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-0.5">
            {visible.map((item) => {
              const isExpanded = expandedId === item.id
              const isDropTarget = dropTargetId === item.id
              const dropBelow = draggingIndex < items.indexOf(item)
              return (
                <li
                  key={item.id}
                  onDragOver={(event) => {
                    if (!draggingId || draggingId === item.id) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropTargetId(item.id)
                  }}
                  onDragLeave={() => setDropTargetId((current) => (current === item.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    dropOn(item.id)
                  }}
                  className={cn('relative flex flex-col rounded', isExpanded && 'bg-muted/40')}
                >
                  {isDropTarget && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-primary',
                        dropBelow ? '-bottom-px' : '-top-px',
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      'group @container flex items-center gap-1 rounded px-0.5 py-0.5 hover:bg-muted/60',
                      draggingId === item.id && 'opacity-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleItem(item.id)}
                      aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                      className="shrink-0 accent-primary"
                    />
                    {/* The actions float over the end of the text instead of
                        reserving a column, so the text uses the full row and
                        the chips to its right never move. */}
                    <div className="relative flex min-w-0 flex-1">
                      <input
                        value={item.text}
                        data-item-text={item.id}
                        onChange={(event) => editItem(item.id, event.target.value)}
                        onBlur={(event) => commitItemText(item.id, event.target.value)}
                        onPaste={(event) => pasteIntoText(item.id, event)}
                        onKeyDown={(event) => moveByKey(item.id, event)}
                        aria-label={`Edit "${item.text}"`}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        className={cn(
                          'w-full min-w-0 truncate rounded-sm bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground/70 group-focus-within:pr-16 group-hover:pr-16 hover:bg-background focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/50',
                          item.done && 'text-muted-foreground line-through',
                          isExpanded && 'pr-16',
                        )}
                      />
                      {/* Hidden actions ignore the pointer, so a tap on the
                          text can never hit an invisible Remove. */}
                      <div
                        className={cn(
                          'pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
                          isExpanded && 'pointer-events-auto opacity-100',
                        )}
                      >
                        <span
                          draggable
                          onDragStart={startDrag(item.id)}
                          onDragEnd={endDrag}
                          title="Drag to reorder, or press Alt+Up/Down while editing"
                          aria-hidden="true"
                          className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="size-3" />
                        </span>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          data-ref-toggle={item.id}
                          onClick={() => toggleEditor(item.id)}
                          aria-label={`Edit links for "${item.text}"`}
                          aria-pressed={isExpanded}
                          className={cn('size-5', isExpanded && 'bg-muted text-foreground')}
                        >
                          <Tag className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove "${item.text}"`}
                          className="size-5"
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </div>
                    {!isExpanded && <InlineRefs refs={item.refs} onShowAll={() => toggleEditor(item.id)} />}
                  </div>
                  {isExpanded && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        submitRefDraft(item.id)
                      }}
                      className="flex flex-wrap items-center gap-1 pt-0.5 pr-0.5 pb-1 pl-6"
                    >
                      {item.refs.map((raw) => (
                        <RefChip key={raw} raw={raw} onRemove={() => removeItemRef(item.id, raw)} />
                      ))}
                      <Input
                        autoFocus
                        value={refDraft}
                        onChange={(event) => setRefDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Escape') return
                          // First Escape closes the editor, not the overlay around the widget.
                          event.stopPropagation()
                          closeEditor(item.id)
                        }}
                        placeholder="Add a link, ticket or tag…"
                        aria-label={`Add a link or ticket to "${item.text}"`}
                        className="h-6 min-w-24 flex-1 text-[11px]"
                      />
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 text-muted-foreground">
        {items.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div
                role="progressbar"
                aria-label="Completed items"
                aria-valuemin={0}
                aria-valuemax={items.length}
                aria-valuenow={doneCount}
                aria-valuetext={`${doneCount} of ${items.length} done`}
                className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${(doneCount / items.length) * 100}%` }}
                />
              </div>
              <span className="shrink-0 whitespace-nowrap">
                {remaining} of {items.length} left
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} className="text-[10px]" />
              <Button type="button" size="xs" variant="ghost" onClick={clearCompleted} disabled={doneCount === 0}>
                Clear done
              </Button>
            </div>
          </>
        )}
        {/* Always shown, so an empty remembered list can still be turned off. */}
        <label
          title="Keep the list after a reload. Saved in this browser, and in share links that include widget configuration."
          className="flex items-center gap-1.5 self-start"
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => toggleRemember(event.target.checked)}
            className="accent-primary"
          />
          Remember tasks
        </label>
      </div>
    </div>
  )
}

// Raw accent colors rather than the semantic success/destructive/muted
// tokens: these aren't status, they're kinds of ref that need to read as
// visually distinct at a glance, the same reasoning SemverWidget's
// PART_STYLES uses for its own per-part palette.
const REF_STYLES: Record<RefKind, { icon: LucideIcon; className: string; hover: string }> = {
  pull: {
    icon: GitPullRequest,
    className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    hover: 'hover:bg-purple-500/20',
  },
  issue: {
    icon: CircleDot,
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    hover: 'hover:bg-blue-500/20',
  },
  ticket: {
    icon: Ticket,
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    hover: 'hover:bg-blue-500/20',
  },
  link: { icon: Link2, className: 'bg-muted text-foreground/80', hover: 'hover:bg-muted-foreground/15' },
  text: { icon: Hash, className: 'bg-muted text-muted-foreground', hover: '' },
}

/** One chip on a narrow row, two once the row is wide enough (a container
 * query on the row); the rest collapse into a count that opens the editor.
 * Capped at half the row so chips never squeeze the text away. */
function InlineRefs({ refs, onShowAll }: { refs: string[]; onShowAll: () => void }) {
  if (refs.length === 0) return null
  const [first, second] = refs
  const narrowHidden = refs.length - 1
  const wideHidden = refs.length - 2
  return (
    <span className="flex max-w-[50%] min-w-0 items-center gap-0.5">
      <RefChip raw={first} />
      {second && <RefChip raw={second} className="hidden @min-[16rem]:inline-flex" />}
      {narrowHidden > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          title={refs.map((raw) => parseRef(raw).label).join(', ')}
          aria-label={`Show all ${refs.length} links`}
          className={cn(
            'shrink-0 rounded-full bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted-foreground/15 hover:text-foreground',
            wideHidden <= 0 && '@min-[16rem]:hidden',
          )}
        >
          +<span className="@min-[16rem]:hidden">{narrowHidden}</span>
          {wideHidden > 0 && <span className="hidden @min-[16rem]:inline">{wideHidden}</span>}
        </button>
      )}
    </span>
  )
}

function RefChip({ raw, onRemove, className }: { raw: string; onRemove?: () => void; className?: string }) {
  const parsed = parseRef(raw)
  const style = REF_STYLES[parsed.kind]
  const Icon = style.icon
  const name = describeRef(parsed)
  const pillClass = cn(
    'inline-flex min-w-0 max-w-28 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
    style.className,
    className,
  )
  const hover = style.hover
  const content = (
    <>
      <Icon className="size-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{parsed.label}</span>
    </>
  )
  const linkProps = parsed.href
    ? { href: parsed.href, target: '_blank', rel: 'noreferrer', title: parsed.href, 'aria-label': `Open ${name}` }
    : null

  if (!onRemove) {
    return linkProps ? (
      <a {...linkProps} className={cn(pillClass, 'transition-colors', hover)}>
        {content}
      </a>
    ) : (
      <span title={raw} className={pillClass}>
        {content}
      </span>
    )
  }

  // In the editor the remove button sits inside the pill, so each chip
  // reads as one removable unit.
  return (
    <span className={cn(pillClass, 'max-w-40 pr-0.5')}>
      {linkProps ? (
        <a {...linkProps} className="inline-flex min-w-0 items-center gap-0.5 hover:underline">
          {content}
        </a>
      ) : (
        <span title={raw} className="inline-flex min-w-0 items-center gap-0.5">
          {content}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="-my-0.5 shrink-0 rounded-full p-0.5 opacity-60 transition hover:bg-current/15 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-2.5" />
      </button>
    </span>
  )
}

import { useId, useState } from 'react'
import { nanoid } from 'nanoid'
import { ListTodo, Plus, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { countRemaining, createTodoItem, isSafeHttpUrl, type TodoItem } from './todoItem'

const DEFAULT_ITEMS: TodoItem[] = []
const DEFAULT_DRAFT = ''

export default function TodoListWidget({ instanceId }: WidgetProps) {
  const [items, setItems] = useWidgetState<TodoItem[]>(instanceId, 'items', DEFAULT_ITEMS)
  const [draft, setDraft] = useWidgetState(instanceId, 'draft', DEFAULT_DRAFT)
  // Which item's ticket/MR fields are currently open for editing — UI-only,
  // like TimelineBuilderWidget's hoveredId/selectedId, so it doesn't belong
  // in persisted item state or count toward dirtiness.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  useWidgetDirty(instanceId, items.length > 0 || draft.trim() !== '')

  const draftId = useId()
  const remaining = countRemaining(items)
  const hasCompleted = items.some((item) => item.done)

  const addItem = () => {
    const item = createTodoItem(nanoid(8), draft)
    if (!item) return
    setItems((previous) => [...previous, item])
    setDraft('')
  }

  const toggleItem = (id: string) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  const editItem = (id: string, text: string) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, text } : item)))
  }

  const editTicket = (id: string, ticket: string) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ticket } : item)))
  }

  const editMrUrl = (id: string, mrUrl: string) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, mrUrl } : item)))
  }

  const removeItem = (id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
    setExpandedId((current) => (current === id ? null : current))
  }

  const clearCompleted = () => {
    setItems((previous) => previous.filter((item) => !item.done))
  }

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
          placeholder="Add an item…"
          aria-label="New to-do item"
          className="h-7 flex-1 text-xs"
        />
        <Button type="submit" size="icon-sm" variant="outline" disabled={draft.trim() === ''} aria-label="Add item">
          <Plus className="size-3.5" />
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <p className="flex h-full items-center justify-center gap-1.5 text-center text-muted-foreground">
            <ListTodo className="size-3.5 shrink-0" aria-hidden="true" />
            Nothing on the list yet
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col">
                <div className="group flex items-center gap-1.5 rounded px-0.5 py-0.5 hover:bg-muted/60">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleItem(item.id)}
                    aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                    className="shrink-0 accent-primary"
                  />
                  <input
                    value={item.text}
                    onChange={(event) => editItem(item.id, event.target.value)}
                    aria-label={`Edit "${item.text}"`}
                    className={cn(
                      'min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground/70 hover:bg-background focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/50',
                      item.done && 'text-muted-foreground line-through',
                    )}
                  />
                  {item.ticket && <TicketBadge text={item.ticket} />}
                  {item.mrUrl && <MrBadge url={item.mrUrl} />}
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                    aria-label={`Edit ticket and MR link for "${item.text}"`}
                    aria-pressed={expandedId === item.id}
                    className={cn(
                      'shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                      expandedId === item.id && 'text-foreground opacity-100',
                    )}
                  >
                    <Tag className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove "${item.text}"`}
                    className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                {expandedId === item.id && (
                  <div className="flex items-center gap-1 py-0.5 pl-5">
                    <Input
                      value={item.ticket}
                      onChange={(event) => editTicket(item.id, event.target.value)}
                      placeholder="Ticket (e.g. PROJ-123)"
                      aria-label={`Ticket number for "${item.text}"`}
                      className="h-6 flex-1 text-[11px]"
                    />
                    <Input
                      value={item.mrUrl}
                      onChange={(event) => editMrUrl(item.id, event.target.value)}
                      placeholder="MR link"
                      aria-label={`Merge request link for "${item.text}"`}
                      className="h-6 flex-1 text-[11px]"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 text-muted-foreground">
          <span>
            {remaining} of {items.length} remaining
          </span>
          <Button type="button" size="xs" variant="ghost" onClick={clearCompleted} disabled={!hasCompleted}>
            Clear completed
          </Button>
        </div>
      )}
    </div>
  )
}

// Raw accent colors rather than the semantic success/destructive/muted
// tokens — these aren't status, they're two different kinds of tag that
// need to read as visually distinct at a glance, the same reasoning
// SemverWidget's PART_STYLES uses for its own per-part palette.
function TicketBadge({ text }: { text: string }) {
  return (
    <span className="shrink-0 truncate rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
      {text}
    </span>
  )
}

function MrBadge({ url }: { url: string }) {
  if (isSafeHttpUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={url}
        aria-label={`Open merge request: ${url}`}
        className="shrink-0 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 transition-colors hover:bg-purple-500/20 dark:text-purple-400"
      >
        MR
      </a>
    )
  }
  return (
    <span
      title="Not a valid link yet"
      className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      MR
    </span>
  )
}

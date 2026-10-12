import { useId } from 'react'
import { nanoid } from 'nanoid'
import { ListTodo, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { countRemaining, createTodoItem, type TodoItem } from './todoItem'

const DEFAULT_ITEMS: TodoItem[] = []
const DEFAULT_DRAFT = ''

export default function TodoListWidget({ instanceId }: WidgetProps) {
  const [items, setItems] = useWidgetState<TodoItem[]>(instanceId, 'items', DEFAULT_ITEMS)
  const [draft, setDraft] = useWidgetState(instanceId, 'draft', DEFAULT_DRAFT)
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

  const removeItem = (id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
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
              <li key={item.id} className="group flex items-center gap-1.5 rounded px-0.5 py-0.5 hover:bg-muted/60">
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

import { lazy } from 'react'
import { ListTodo } from 'lucide-react'
import * as v from 'valibot'
import type { WidgetDefinition } from '@/widgets/types'

// Mirrors TodoItem. Text may be blank while an item is being retyped.
const todoItemSchema = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
  refs: v.array(v.string()),
})

export const todoListDefinition: WidgetDefinition = {
  id: 'todo-list',
  name: 'To-Do List',
  description:
    'A checklist with links: attach PRs, issues, tickets or any URL, then reorder, filter and check items off',
  category: 'text',
  icon: ListTodo,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./TodoListWidget')),
  // Opt-in through "Remember tasks"; items are session state otherwise.
  configSchema: v.object({ remember: v.boolean(), savedItems: v.array(todoItemSchema) }),
  keywords: [
    'todo',
    'to-do',
    'checklist',
    'tasks',
    'list',
    'planner',
    'reminders',
    'pr',
    'pull request',
    'merge request',
    'issue',
    'ticket',
    'links',
  ],
}

import { lazy } from 'react'
import { ListTodo } from 'lucide-react'
import type { WidgetDefinition } from '@/widgets/types'

export const todoListDefinition: WidgetDefinition = {
  id: 'todo-list',
  name: 'To-Do List',
  description: 'A quick checklist: add items, check them off, edit or remove them, and clear what is done',
  category: 'text',
  icon: ListTodo,
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  component: lazy(() => import('./TodoListWidget')),
  keywords: ['todo', 'to-do', 'checklist', 'tasks', 'list', 'planner', 'reminders'],
}

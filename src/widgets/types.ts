import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'
import type * as v from 'valibot'

export type WidgetCategory =
  | 'encoding'
  | 'formatting'
  | 'generators'
  | 'security'
  | 'color'
  | 'image'
  | 'text'
  | 'math'
  | 'network'
  | 'time'
  | 'ai'

export interface WidgetSize {
  w: number
  h: number
}

/** Props every widget component receives. `mode` lets a widget adapt its
 * layout when expanded to the fullscreen overlay vs. rendered in a grid cell. */
export interface WidgetProps {
  instanceId: string
  mode: 'grid' | 'overlay'
}

/** Describes a widget for the registry — the single source of truth consumed
 * by the dashboard grid, the tool browser, and the command palette. */
export interface WidgetDefinition {
  /** Stable key used in persisted/shared layouts and URLs. Never rename. */
  id: string
  name: string
  description: string
  category: WidgetCategory
  icon: LucideIcon
  defaultSize: WidgetSize
  minSize?: WidgetSize
  maxSize?: WidgetSize
  component: LazyExoticComponent<ComponentType<WidgetProps>>
  /** Extra search terms surfaced in the tool browser / command palette. */
  keywords?: string[]
  /** Fields this widget persists as configuration via `useWidgetConfig`.
   * Only for setup that is tedious to redo and then used passively; see
   * docs/widget-architecture.md. Field names are a storage contract: never
   * rename them. */
  configSchema?: WidgetConfigSchema
  /** Inputs and output other widgets can be wired to. See the Connectors
   * section of docs/widget-architecture.md. */
  connectors?: WidgetConnectors
}

export interface WidgetInput {
  /** The `useWidgetState` field incoming values are written into. Never
   * rename: saved connections refer to it. */
  field: string
  label: string
}

export interface WidgetConnectors {
  inputs?: WidgetInput[]
  /** Set when the widget publishes a value with `useWidgetOutput`. */
  output?: { label: string }
}

export type WidgetConfigSchema = v.ObjectSchema<v.ObjectEntries, undefined>

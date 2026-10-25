/** A single widget placed on a dashboard: which widget it is, its
 * position/size in grid units, and its optional configuration. This is
 * exactly what gets persisted and shared, never the widget's live state. */
export interface DashboardWidgetInstance {
  instanceId: string
  widgetId: string
  x: number
  y: number
  w: number
  h: number
  /** Setup fields written by `useWidgetConfig`, validated against the
   * widget's `configSchema`. See docs/widget-architecture.md. */
  config?: Record<string, unknown>
}

/** A named tab — its own independent grid of widgets. */
export interface Dashboard {
  id: string
  name: string
  widgets: DashboardWidgetInstance[]
}

export const WORKSPACE_LAYOUT_VERSION = 2 as const

/** Shape of the whole multi-dashboard workspace, as persisted to
 * localStorage or encoded into a share URL. `version` allows safe schema
 * migration later, the same way it already did for the single-dashboard
 * shape it replaces (see `DashboardLayoutV1` below). */
export interface WorkspaceLayoutV2 {
  version: typeof WORKSPACE_LAYOUT_VERSION
  dashboards: Dashboard[]
  activeDashboardId: string
}

/** Pre-tabs share-link shape. Kept only so `layoutCodec.ts` can still decode
 * links generated before this version existed — never written anymore. */
export const DASHBOARD_LAYOUT_VERSION = 1 as const

export interface DashboardLayoutV1 {
  version: typeof DASHBOARD_LAYOUT_VERSION
  widgets: DashboardWidgetInstance[]
}

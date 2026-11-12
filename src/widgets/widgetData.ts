import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import * as v from 'valibot'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import type { Dashboard, DashboardWidgetInstance } from '@/types/layout'
import { getWidgetDefinition } from './registry'
import { useWidgetDataSettings } from './useWidgetDataSettings'
import { useWidgetState } from './useWidgetState'

/** Finds a pinned instance on any dashboard. Undefined for an ephemeral
 * overlay instance, which lives on no dashboard. */
export function findWidgetInstance(dashboards: Dashboard[], instanceId: string): DashboardWidgetInstance | undefined {
  for (const dashboard of dashboards) {
    const instance = dashboard.widgets.find((widget) => widget.instanceId === instanceId)
    if (instance) return instance
  }
  return undefined
}

function isValidField(widgetId: string, field: string, value: unknown): boolean {
  const entries = getWidgetDefinition(widgetId)?.dataSchema?.entries
  // Own keys only: an inherited name like `toString` is not a schema entry.
  if (!entries || !Object.hasOwn(entries, field)) return false
  return v.safeParse(entries[field], value).success
}

/** Keeps only the fields that match the widget's `dataSchema`. Returns
 * undefined when nothing survives, so callers can drop the key entirely.
 * This is the trust boundary for data read from a share link. */
export function sanitizeWidgetData(widgetId: string, data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== 'object') return undefined
  const kept = Object.entries(data).filter(([field, value]) => isValidField(widgetId, field, value))
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

/** Like `useWidgetState`, but for fields that should survive reloads
 * and can travel with a share link. Pinned instances read and write
 * `instance.data`; an ephemeral overlay instance falls back to
 * `useWidgetState` until it gets pinned (see `pinInstance`). A stored value
 * that no longer matches the schema falls back to `initial`. While widget
 * data is turned off in Settings, every instance uses `useWidgetState` and
 * the stored value is left untouched. */
export function useWidgetData<T>(
  instanceId: string,
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [fallback] = useState(initial)
  const [ephemeral, setEphemeral] = useWidgetState<T>(instanceId, field, fallback)
  const enabled = useWidgetDataSettings((state) => state.enabled)
  const widgetId = useDashboardStore((state) => findWidgetInstance(state.dashboards, instanceId)?.widgetId)
  const stored = useDashboardStore((state) => findWidgetInstance(state.dashboards, instanceId)?.data?.[field])

  const value = useMemo(() => {
    if (!widgetId || !enabled) return ephemeral
    return isValidField(widgetId, field, stored) ? (stored as T) : fallback
  }, [widgetId, enabled, field, stored, ephemeral, fallback])

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const store = useDashboardStore.getState()
      const instance = findWidgetInstance(store.dashboards, instanceId)
      if (!instance || !useWidgetDataSettings.getState().enabled) {
        setEphemeral(next)
        return
      }
      const current = instance.data?.[field]
      const resolved =
        typeof next === 'function'
          ? (next as (prev: T) => T)(isValidField(instance.widgetId, field, current) ? (current as T) : fallback)
          : next
      store.setWidgetData(instanceId, field, resolved)
    },
    [instanceId, field, fallback, setEphemeral],
  )

  return [value, setValue]
}

/** True when a pinned instance holds any widget data. */
export function useHasWidgetData(instanceId: string): boolean {
  return useDashboardStore((state) => {
    const data = findWidgetInstance(state.dashboards, instanceId)?.data
    return data !== undefined && Object.keys(data).length > 0
  })
}

export interface WidgetDataEntry {
  dashboardId: string
  dashboardName: string
  instance: DashboardWidgetInstance
}

/** Every pinned instance holding widget data, in dashboard order. */
export function listWidgetData(dashboards: Dashboard[]): WidgetDataEntry[] {
  return dashboards.flatMap((dashboard) =>
    dashboard.widgets
      .filter((widget) => widget.data && Object.keys(widget.data).length > 0)
      .map((instance) => ({ dashboardId: dashboard.id, dashboardName: dashboard.name, instance })),
  )
}

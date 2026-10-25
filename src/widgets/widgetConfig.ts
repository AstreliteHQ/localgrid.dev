import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import * as v from 'valibot'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import type { Dashboard, DashboardWidgetInstance } from '@/types/layout'
import { getWidgetDefinition } from './registry'
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
  const entry = getWidgetDefinition(widgetId)?.configSchema?.entries[field]
  return entry !== undefined && v.safeParse(entry, value).success
}

/** Keeps only the fields that match the widget's `configSchema`. Returns
 * undefined when nothing survives, so callers can drop the key entirely.
 * This is the trust boundary for configs read from a share link. */
export function sanitizeConfig(widgetId: string, config: unknown): Record<string, unknown> | undefined {
  if (!config || typeof config !== 'object') return undefined
  const kept = Object.entries(config).filter(([field, value]) => isValidField(widgetId, field, value))
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

/** Like `useWidgetState`, but for setup fields that should survive reloads
 * and can travel with a share link. Pinned instances read and write
 * `instance.config`; an ephemeral overlay instance falls back to
 * `useWidgetState` until it gets pinned (see `pinInstance`). A stored value
 * that no longer matches the schema falls back to `initial`. */
export function useWidgetConfig<T>(
  instanceId: string,
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [fallback] = useState(initial)
  const [ephemeral, setEphemeral] = useWidgetState<T>(instanceId, field, fallback)
  const widgetId = useDashboardStore((state) => findWidgetInstance(state.dashboards, instanceId)?.widgetId)
  const stored = useDashboardStore((state) => findWidgetInstance(state.dashboards, instanceId)?.config?.[field])

  const value = useMemo(() => {
    if (!widgetId) return ephemeral
    return isValidField(widgetId, field, stored) ? (stored as T) : fallback
  }, [widgetId, field, stored, ephemeral, fallback])

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const store = useDashboardStore.getState()
      const instance = findWidgetInstance(store.dashboards, instanceId)
      if (!instance) {
        setEphemeral(next)
        return
      }
      const current = instance.config?.[field]
      const resolved =
        typeof next === 'function'
          ? (next as (prev: T) => T)(isValidField(instance.widgetId, field, current) ? (current as T) : fallback)
          : next
      store.setWidgetConfig(instanceId, field, resolved)
    },
    [instanceId, field, fallback, setEphemeral],
  )

  return [value, setValue]
}

/** True when a pinned instance holds any saved configuration. */
export function useHasWidgetConfig(instanceId: string): boolean {
  return useDashboardStore((state) => {
    const config = findWidgetInstance(state.dashboards, instanceId)?.config
    return config !== undefined && Object.keys(config).length > 0
  })
}

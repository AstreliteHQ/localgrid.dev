import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { getWidgetDefinition } from '@/widgets/registry'
import type { WidgetDefinition } from '@/widgets/types'
import type { Dashboard } from '@/types/layout'

function widgetIdOf(dashboards: Dashboard[], instanceId: string | undefined): string | undefined {
  if (!instanceId) return undefined
  for (const dashboard of dashboards) {
    const instance = dashboard.widgets.find((widget) => widget.instanceId === instanceId)
    if (instance) return instance.widgetId
  }
  return undefined
}

/** Definition of the widget behind a pinned instance, read once. */
export function instanceDefinition(instanceId: string | undefined): WidgetDefinition | undefined {
  const widgetId = widgetIdOf(useDashboardStore.getState().dashboards, instanceId)
  return widgetId ? getWidgetDefinition(widgetId) : undefined
}

/** Definition of the widget behind a pinned instance. */
export function useInstanceDefinition(instanceId: string | undefined): WidgetDefinition | undefined {
  const widgetId = useDashboardStore((state) => widgetIdOf(state.dashboards, instanceId))
  return widgetId ? getWidgetDefinition(widgetId) : undefined
}

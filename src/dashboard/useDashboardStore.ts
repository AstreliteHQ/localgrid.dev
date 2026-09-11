import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import { getWidgetDefinition } from '@/widgets/registry'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import type { Dashboard, DashboardWidgetInstance } from '@/types/layout'
import { DASHBOARD_STORAGE_KEY, DASHBOARD_STORAGE_VERSION } from './persistence'

interface LayoutUpdate {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface GridPosition {
  x: number
  y: number
  w: number
  h: number
}

export const MAX_DASHBOARDS = 5

interface PersistedDashboardState {
  dashboards: Dashboard[]
  activeDashboardId: string
}

interface DashboardState extends PersistedDashboardState {
  addWidget: (dashboardId: string, widgetId: string) => void
  /** Same as `addWidget`, but at an explicit position/size instead of being
   * appended below everything else — used when a widget is dropped onto the
   * grid from the sidebar. */
  addWidgetAt: (dashboardId: string, widgetId: string, position: GridPosition) => void
  removeWidget: (dashboardId: string, instanceId: string) => void
  applyLayoutUpdate: (dashboardId: string, layout: readonly LayoutUpdate[]) => void
  /** Keyboard-accessible alternative to dragging/resizing a grid item — used
   * by the move/resize dialog in the widget shell's "…" menu. */
  setWidgetPosition: (dashboardId: string, instanceId: string, position: GridPosition) => void

  addDashboard: (name: string) => void
  renameDashboard: (id: string, name: string) => void
  /** Refuses on the last remaining dashboard. Reassigns `activeDashboardId`
   * if the removed one was active. */
  removeDashboard: (id: string) => void
  setActiveDashboardId: (id: string) => void
  /** The share-link accept path — replaces the entire workspace at once. */
  importWorkspace: (dashboards: Dashboard[], activeDashboardId: string) => void
}

/** Instance ids only need to be unique, never meaningful — namespaced by
 * dashboard so the same widget seeded onto two tabs (content-type-detector,
 * notes) doesn't collide in useWidgetState's instanceId-keyed store. */
function starterWidgets(
  dashboard: string,
  widgets: Omit<DashboardWidgetInstance, 'instanceId'>[],
): DashboardWidgetInstance[] {
  return widgets.map((widget) => ({ ...widget, instanceId: `seed-${dashboard}-${widget.widgetId}` }))
}

const MAIN_DASHBOARD_ID = 'seed-main'
const DEV_DASHBOARD_ID = 'seed-dev'
const DESIGN_DASHBOARD_ID = 'seed-design'

/** Seed shown on a true first visit (nothing in localStorage yet). Once
 * persist hydrates from a real stored value — including a workspace the
 * user arrived at by removing every widget — this is overwritten and never
 * reappears. */
const STARTER_DASHBOARD_ID = DEV_DASHBOARD_ID
const STARTER_DASHBOARDS: Dashboard[] = [
  {
    id: MAIN_DASHBOARD_ID,
    name: '✨️ Main',
    widgets: starterWidgets('main', [
      { widgetId: 'content-type-detector', x: 5, y: 0, w: 4, h: 4 },
      { widgetId: 'timer', x: 9, y: 7, w: 3, h: 3 },
      { widgetId: 'notes', x: 0, y: 0, w: 5, h: 4 },
      { widgetId: 'password-generator', x: 4, y: 7, w: 5, h: 3 },
      { widgetId: 'percentage-calculator', x: 3, y: 4, w: 3, h: 3 },
      { widgetId: 'unit-converter', x: 0, y: 4, w: 3, h: 3 },
      { widgetId: 'expression-evaluator', x: 6, y: 4, w: 3, h: 3 },
      { widgetId: 'invisible-char-cleaner', x: 0, y: 7, w: 4, h: 4 },
      { widgetId: 'world-clock', x: 9, y: 0, w: 3, h: 7 },
    ]),
  },
  {
    id: DEV_DASHBOARD_ID,
    name: '💻 Dev',
    widgets: starterWidgets('dev', [
      { widgetId: 'log-viewer', x: 0, y: 0, w: 6, h: 5 },
      { widgetId: 'text-diff', x: 6, y: 0, w: 6, h: 5 },
      { widgetId: 'base64', x: 0, y: 5, w: 3, h: 3 },
      { widgetId: 'certificate-viewer', x: 8, y: 5, w: 4, h: 7 },
      { widgetId: 'content-type-detector', x: 3, y: 5, w: 5, h: 3 },
      { widgetId: 'json-formatter', x: 0, y: 8, w: 5, h: 4 },
      { widgetId: 'subnet-calculator', x: 5, y: 8, w: 3, h: 4 },
      { widgetId: 'timeline-builder', x: 0, y: 12, w: 6, h: 5 },
    ]),
  },
  {
    id: DESIGN_DASHBOARD_ID,
    name: '🎨Design',
    widgets: starterWidgets('design', [
      { widgetId: 'color-converter', x: 0, y: 0, w: 6, h: 4 },
      { widgetId: 'wcag-checker', x: 0, y: 4, w: 6, h: 4 },
      { widgetId: 'notes', x: 6, y: 0, w: 6, h: 4 },
      { widgetId: 'emoji-picker', x: 6, y: 4, w: 4, h: 4 },
    ]),
  },
]

function nextAvailableY(widgets: DashboardWidgetInstance[]): number {
  return widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0)
}

/** Updates one dashboard's widgets by id. Every *other* dashboard keeps the
 * exact same object reference it had before — not just a shallow copy with
 * equal values — so a change on one tab can never be mistaken for a change
 * on another by anything doing reference-based comparisons downstream. */
function updateDashboardWidgets(
  dashboards: Dashboard[],
  dashboardId: string,
  update: (widgets: DashboardWidgetInstance[]) => DashboardWidgetInstance[],
): Dashboard[] {
  return dashboards.map((dashboard) =>
    dashboard.id === dashboardId ? { ...dashboard, widgets: update(dashboard.widgets) } : dashboard,
  )
}

/** Upgrades a pre-tabs (version 1) stored value in place instead of
 * discarding it — real users may already have widgets pinned. Exported as a
 * standalone pure function so it can be unit-tested directly against a
 * hand-built legacy blob, without needing to simulate `persist`'s
 * localStorage hydration timing. */
export function migrateDashboardState(persisted: unknown, version: number): PersistedDashboardState {
  if (version < 2) {
    const legacy = persisted as { widgets?: DashboardWidgetInstance[] } | undefined
    const widgets = legacy?.widgets && Array.isArray(legacy.widgets) ? legacy.widgets : STARTER_DASHBOARDS[0].widgets
    return {
      dashboards: [{ id: 'main', name: 'Main', widgets }],
      activeDashboardId: 'main',
    }
  }
  return persisted as PersistedDashboardState
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      dashboards: STARTER_DASHBOARDS,
      activeDashboardId: STARTER_DASHBOARD_ID,

      addWidget: (dashboardId, widgetId) => {
        const definition = getWidgetDefinition(widgetId)
        if (!definition) return
        set((state) => ({
          dashboards: updateDashboardWidgets(state.dashboards, dashboardId, (widgets) => [
            ...widgets,
            {
              instanceId: nanoid(8),
              widgetId,
              x: 0,
              y: nextAvailableY(widgets),
              w: definition.defaultSize.w,
              h: definition.defaultSize.h,
            },
          ]),
        }))
      },

      addWidgetAt: (dashboardId, widgetId, position) => {
        if (!getWidgetDefinition(widgetId)) return
        set((state) => ({
          dashboards: updateDashboardWidgets(state.dashboards, dashboardId, (widgets) => [
            ...widgets,
            { instanceId: nanoid(8), widgetId, ...position },
          ]),
        }))
      },

      removeWidget: (dashboardId, instanceId) => {
        set((state) => ({
          dashboards: updateDashboardWidgets(state.dashboards, dashboardId, (widgets) =>
            widgets.filter((widget) => widget.instanceId !== instanceId),
          ),
        }))
        // A real deletion, unlike a tab switch — this instance is never
        // coming back, so its content would otherwise leak in useWidgetState's
        // store for the rest of the session.
        useWidgetStateStore.getState().resetInstances([instanceId])
      },

      applyLayoutUpdate: (dashboardId, layout) => {
        set((state) => {
          let changed = false
          const dashboards = updateDashboardWidgets(state.dashboards, dashboardId, (widgets) =>
            widgets.map((widget) => {
              const updated = layout.find((item) => item.i === widget.instanceId)
              if (
                !updated ||
                (updated.x === widget.x && updated.y === widget.y && updated.w === widget.w && updated.h === widget.h)
              ) {
                return widget
              }
              changed = true
              return { ...widget, x: updated.x, y: updated.y, w: updated.w, h: updated.h }
            }),
          )
          // react-grid-layout calls onLayoutChange again for every layout it
          // renders, echoes included. Returning a changed reference for a
          // no-op update would re-trigger that forever (max update depth).
          return changed ? { dashboards } : state
        })
      },

      setWidgetPosition: (dashboardId, instanceId, position) => {
        set((state) => ({
          dashboards: updateDashboardWidgets(state.dashboards, dashboardId, (widgets) =>
            widgets.map((widget) => (widget.instanceId === instanceId ? { ...widget, ...position } : widget)),
          ),
        }))
      },

      addDashboard: (name) => {
        set((state) => {
          if (state.dashboards.length >= MAX_DASHBOARDS) return state
          const id = nanoid(8)
          return {
            dashboards: [...state.dashboards, { id, name, widgets: [] }],
            activeDashboardId: id,
          }
        })
      },

      renameDashboard: (id, name) => {
        set((state) => ({
          dashboards: state.dashboards.map((dashboard) => (dashboard.id === id ? { ...dashboard, name } : dashboard)),
        }))
      },

      removeDashboard: (id) => {
        const { dashboards } = get()
        if (dashboards.length <= 1) return
        const removedInstanceIds =
          dashboards.find((dashboard) => dashboard.id === id)?.widgets.map((widget) => widget.instanceId) ?? []
        set((state) => {
          const remaining = state.dashboards.filter((dashboard) => dashboard.id !== id)
          const activeDashboardId = state.activeDashboardId === id ? remaining[0].id : state.activeDashboardId
          return { dashboards: remaining, activeDashboardId }
        })
        if (removedInstanceIds.length > 0) {
          useWidgetStateStore.getState().resetInstances(removedInstanceIds)
        }
      },

      setActiveDashboardId: (id) => {
        set((state) => (state.dashboards.some((dashboard) => dashboard.id === id) ? { activeDashboardId: id } : state))
      },

      importWorkspace: (dashboards, activeDashboardId) => set({ dashboards, activeDashboardId }),
    }),
    {
      name: DASHBOARD_STORAGE_KEY,
      version: DASHBOARD_STORAGE_VERSION,
      partialize: (state) => ({
        dashboards: state.dashboards,
        activeDashboardId: state.activeDashboardId,
      }),
      migrate: migrateDashboardState,
    },
  ),
)

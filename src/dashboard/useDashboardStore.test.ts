import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Dashboard } from '@/types/layout'
import { useWidgetState } from '@/widgets/useWidgetState'
import { MAX_DASHBOARDS, migrateDashboardState, useDashboardStore } from './useDashboardStore'

const DASHBOARD_A = 'dashboard-a'
const DASHBOARD_B = 'dashboard-b'

function twoEmptyDashboards(): Dashboard[] {
  return [
    { id: DASHBOARD_A, name: 'A', widgets: [] },
    { id: DASHBOARD_B, name: 'B', widgets: [] },
  ]
}

beforeEach(() => {
  useDashboardStore.setState({
    dashboards: twoEmptyDashboards(),
    activeDashboardId: DASHBOARD_A,
  })
})

describe('useDashboardStore — widget actions are scoped per dashboard', () => {
  it('addWidget appends a correctly sized instance to only the given dashboard', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'uuid-generator')

    const { dashboards } = useDashboardStore.getState()
    const dashboardA = dashboards.find((d) => d.id === DASHBOARD_A)!
    const dashboardB = dashboards.find((d) => d.id === DASHBOARD_B)!

    expect(dashboardA.widgets).toHaveLength(1)
    expect(dashboardA.widgets[0]).toMatchObject({ widgetId: 'uuid-generator', x: 0, y: 0 })
    expect(dashboardB.widgets).toHaveLength(0)
  })

  it('addWidget silently ignores an unknown widget id', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'not-a-real-widget')

    expect(useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets).toHaveLength(0)
  })

  it('addWidget stacks new widgets below existing ones in the same dashboard', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')

    const [first, second] = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.h)
  })

  it('addWidgetAt places a widget at the given position, scoped to the dashboard', () => {
    useDashboardStore.getState().addWidgetAt(DASHBOARD_A, 'base64', { x: 3, y: 2, w: 2, h: 2 })

    const dashboardA = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!
    expect(dashboardA.widgets).toEqual([
      expect.objectContaining({ widgetId: 'base64', x: 3, y: 2, w: 2, h: 2 }),
    ])
  })

  it('addWidgetAt silently ignores an unknown widget id', () => {
    useDashboardStore.getState().addWidgetAt(DASHBOARD_A, 'not-a-real-widget', { x: 0, y: 0, w: 2, h: 2 })

    expect(useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets).toHaveLength(0)
  })

  it('removeWidget removes only the targeted instance from the targeted dashboard', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    useDashboardStore.getState().addWidget(DASHBOARD_B, 'base64')
    const instanceId = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
      .instanceId

    useDashboardStore.getState().removeWidget(DASHBOARD_A, instanceId)

    const { dashboards } = useDashboardStore.getState()
    expect(dashboards.find((d) => d.id === DASHBOARD_A)!.widgets).toHaveLength(0)
    expect(dashboards.find((d) => d.id === DASHBOARD_B)!.widgets).toHaveLength(1)
  })

  it('applyLayoutUpdate updates position/size of matching instances, scoped to the dashboard', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    const instanceId = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
      .instanceId

    useDashboardStore
      .getState()
      .applyLayoutUpdate(DASHBOARD_A, [{ i: instanceId, x: 5, y: 5, w: 3, h: 3 }])

    const widget = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
    expect(widget).toMatchObject({ x: 5, y: 5, w: 3, h: 3 })
  })

  it('setWidgetPosition patches a single instance, scoped to the dashboard', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    const instanceId = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
      .instanceId

    useDashboardStore.getState().setWidgetPosition(DASHBOARD_A, instanceId, { x: 1, y: 1, w: 4, h: 4 })

    const widget = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
    expect(widget).toMatchObject({ x: 1, y: 1, w: 4, h: 4 })
  })

  it('widgets added to one dashboard never leak into another dashboard', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'uuid-generator')
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    useDashboardStore.getState().addWidget(DASHBOARD_B, 'json-formatter')

    const { dashboards } = useDashboardStore.getState()
    const dashboardA = dashboards.find((d) => d.id === DASHBOARD_A)!
    const dashboardB = dashboards.find((d) => d.id === DASHBOARD_B)!

    expect(dashboardA.widgets.map((w) => w.widgetId)).toEqual(['uuid-generator', 'base64'])
    expect(dashboardB.widgets.map((w) => w.widgetId)).toEqual(['json-formatter'])
  })

  it('touching one dashboard leaves every other dashboard object reference untouched', () => {
    const dashboardBBefore = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_B)!

    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')

    const dashboardBAfter = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_B)!
    expect(dashboardBAfter).toBe(dashboardBBefore)
  })

  it('removeWidget also clears the removed instance from useWidgetState, so it cannot leak', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    const instanceId = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
      .instanceId
    const content = renderHook(() => useWidgetState(instanceId, 'input', ''))
    act(() => content.result.current[1]('typed before deletion'))

    useDashboardStore.getState().removeWidget(DASHBOARD_A, instanceId)

    const contentAfter = renderHook(() => useWidgetState(instanceId, 'input', 'fresh-default'))
    expect(contentAfter.result.current[0]).toBe('fresh-default')
  })

  it('clearDashboard removes every widget from the targeted dashboard, leaving others untouched', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'uuid-generator')
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    useDashboardStore.getState().addWidget(DASHBOARD_B, 'json-formatter')

    useDashboardStore.getState().clearDashboard(DASHBOARD_A)

    const { dashboards } = useDashboardStore.getState()
    expect(dashboards.find((d) => d.id === DASHBOARD_A)!.widgets).toEqual([])
    expect(dashboards.find((d) => d.id === DASHBOARD_B)!.widgets).toHaveLength(1)
  })

  it('clearDashboard keeps the dashboard itself (name, tab) in place', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')

    useDashboardStore.getState().clearDashboard(DASHBOARD_A)

    const { dashboards } = useDashboardStore.getState()
    expect(dashboards.map((d) => d.id)).toEqual([DASHBOARD_A, DASHBOARD_B])
  })

  it('clearDashboard is a no-op on an already-empty dashboard', () => {
    const before = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!

    useDashboardStore.getState().clearDashboard(DASHBOARD_A)

    expect(useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!).toBe(before)
  })

  it('clearDashboard also clears every removed widget from useWidgetState, so none of them leak', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_A, 'base64')
    const instanceId = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_A)!.widgets[0]
      .instanceId
    const content = renderHook(() => useWidgetState(instanceId, 'input', ''))
    act(() => content.result.current[1]('typed before clearing'))

    useDashboardStore.getState().clearDashboard(DASHBOARD_A)

    const contentAfter = renderHook(() => useWidgetState(instanceId, 'input', 'fresh-default'))
    expect(contentAfter.result.current[0]).toBe('fresh-default')
  })
})

describe('useDashboardStore — dashboard management', () => {
  it('addDashboard appends a new dashboard and makes it active', () => {
    useDashboardStore.getState().addDashboard('Extra')

    const { dashboards, activeDashboardId } = useDashboardStore.getState()
    expect(dashboards).toHaveLength(3)
    const added = dashboards[2]
    expect(added.name).toBe('Extra')
    expect(added.widgets).toEqual([])
    expect(activeDashboardId).toBe(added.id)
  })

  it('addDashboard refuses past the MAX_DASHBOARDS cap', () => {
    while (useDashboardStore.getState().dashboards.length < MAX_DASHBOARDS) {
      useDashboardStore.getState().addDashboard('Filler')
    }
    const beforeCount = useDashboardStore.getState().dashboards.length
    expect(beforeCount).toBe(MAX_DASHBOARDS)

    useDashboardStore.getState().addDashboard('One too many')

    expect(useDashboardStore.getState().dashboards).toHaveLength(MAX_DASHBOARDS)
  })

  it('renameDashboard updates only the targeted dashboard name', () => {
    useDashboardStore.getState().renameDashboard(DASHBOARD_A, 'Renamed')

    const { dashboards } = useDashboardStore.getState()
    expect(dashboards.find((d) => d.id === DASHBOARD_A)!.name).toBe('Renamed')
    expect(dashboards.find((d) => d.id === DASHBOARD_B)!.name).toBe('B')
  })

  it('removeDashboard refuses to remove the last remaining dashboard', () => {
    useDashboardStore.setState({ dashboards: [{ id: DASHBOARD_A, name: 'A', widgets: [] }], activeDashboardId: DASHBOARD_A })

    useDashboardStore.getState().removeDashboard(DASHBOARD_A)

    expect(useDashboardStore.getState().dashboards).toHaveLength(1)
  })

  it('removeDashboard reassigns activeDashboardId when removing the active dashboard', () => {
    useDashboardStore.setState({ activeDashboardId: DASHBOARD_A })

    useDashboardStore.getState().removeDashboard(DASHBOARD_A)

    const { dashboards, activeDashboardId } = useDashboardStore.getState()
    expect(dashboards).toHaveLength(1)
    expect(dashboards[0].id).toBe(DASHBOARD_B)
    expect(activeDashboardId).toBe(DASHBOARD_B)
  })

  it('removeDashboard leaves activeDashboardId untouched when removing a non-active dashboard', () => {
    useDashboardStore.setState({ activeDashboardId: DASHBOARD_A })

    useDashboardStore.getState().removeDashboard(DASHBOARD_B)

    const { dashboards, activeDashboardId } = useDashboardStore.getState()
    expect(dashboards).toHaveLength(1)
    expect(activeDashboardId).toBe(DASHBOARD_A)
  })

  it('setActiveDashboardId switches to a known dashboard', () => {
    useDashboardStore.getState().setActiveDashboardId(DASHBOARD_B)

    expect(useDashboardStore.getState().activeDashboardId).toBe(DASHBOARD_B)
  })

  it('setActiveDashboardId ignores an unknown dashboard id', () => {
    useDashboardStore.getState().setActiveDashboardId('not-a-real-dashboard')

    expect(useDashboardStore.getState().activeDashboardId).toBe(DASHBOARD_A)
  })

  it('importWorkspace replaces the entire dashboards list and active id', () => {
    const incoming: Dashboard[] = [{ id: 'imported', name: 'Imported', widgets: [] }]

    useDashboardStore.getState().importWorkspace(incoming, 'imported')

    expect(useDashboardStore.getState().dashboards).toEqual(incoming)
    expect(useDashboardStore.getState().activeDashboardId).toBe('imported')
  })

  it('removeDashboard also clears every one of its widgets from useWidgetState', () => {
    useDashboardStore.getState().addWidget(DASHBOARD_B, 'base64')
    const instanceId = useDashboardStore.getState().dashboards.find((d) => d.id === DASHBOARD_B)!.widgets[0]
      .instanceId
    const content = renderHook(() => useWidgetState(instanceId, 'input', ''))
    act(() => content.result.current[1]('typed before deletion'))

    useDashboardStore.getState().removeDashboard(DASHBOARD_B)

    const contentAfter = renderHook(() => useWidgetState(instanceId, 'input', 'fresh-default'))
    expect(contentAfter.result.current[0]).toBe('fresh-default')
  })
})

describe('migrateDashboardState — v1 to v2 upgrade', () => {
  it('wraps a pre-tabs { widgets } blob into a single "Main" dashboard', () => {
    const legacy = {
      widgets: [{ instanceId: 'legacy-1', widgetId: 'base64', x: 0, y: 0, w: 2, h: 2 }],
    }

    const migrated = migrateDashboardState(legacy, 1)

    expect(migrated).toEqual({
      dashboards: [{ id: 'main', name: 'Main', widgets: legacy.widgets }],
      activeDashboardId: 'main',
    })
  })

  it('falls back to the starter widgets when the legacy blob has no widgets array', () => {
    const migrated = migrateDashboardState({}, 1)

    expect(migrated.dashboards).toHaveLength(1)
    expect(migrated.dashboards[0].id).toBe('main')
    expect(migrated.dashboards[0].widgets.length).toBeGreaterThan(0)
    expect(migrated.activeDashboardId).toBe('main')
  })

  it('passes an already-current (version 2) blob through unchanged', () => {
    const current = { dashboards: twoEmptyDashboards(), activeDashboardId: DASHBOARD_A }

    expect(migrateDashboardState(current, 2)).toBe(current)
  })
})

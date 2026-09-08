import { useMemo } from 'react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './grid-placeholder.css'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useWidgetDragStore } from '@/sidebar/useWidgetDragStore'
import { getWidgetDefinition } from '@/widgets/registry'
import {
  EDITABLE_BREAKPOINT,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
} from './gridConstants'
import { WidgetGridItem } from './WidgetGridItem'
import { useDashboardStore } from './useDashboardStore'

// Reserve a real drop target height even with zero widgets — react-grid-
// layout's autoSize would otherwise collapse it to ~0px, leaving nowhere to
// drop the first widget.
const EMPTY_GRID_MIN_HEIGHT = 240

interface GridLayoutProps {
  dashboardId: string
}

/** Only ever mounted for the active dashboard — content no longer depends on
 * staying mounted (see WidgetGridItem/useWidgetState), so there's nothing to
 * lose by letting a tab switch really unmount this. Dashboard.tsx keys this
 * by dashboardId so switching tabs is a clean full remount. */
export function GridLayout({ dashboardId }: GridLayoutProps) {
  const widgets = useDashboardStore(
    (state) => state.dashboards.find((dashboard) => dashboard.id === dashboardId)?.widgets ?? [],
  )
  const removeWidget = useDashboardStore((state) => state.removeWidget)
  const applyLayoutUpdate = useDashboardStore((state) => state.applyLayoutUpdate)
  const addWidgetAt = useDashboardStore((state) => state.addWidgetAt)
  const isEditable = useMediaQuery(EDITABLE_BREAKPOINT)
  const { width, containerRef, mounted } = useContainerWidth()

  const layout: Layout = useMemo(
    () =>
      widgets.map((widget) => ({
        i: widget.instanceId,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
      })),
    [widgets],
  )

  // Mobile: static, non-draggable vertical stack in saved order. Same
  // underlying layout data as the grid, just a different CSS arrangement.
  // Expand-to-fullscreen still works here — it isn't a "layout edit", and
  // there's no drag-to-add from the sidebar either (it's hidden on mobile).
  if (!isEditable) {
    return widgets.length === 0 ? (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-input">
        <p className="text-muted-foreground">
          No widgets yet — add one to get started.
        </p>
      </div>
    ) : (
      <div className="flex flex-1 flex-col gap-4">
        {[...widgets]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((instance) => (
            <div key={instance.instanceId} className="h-64">
              <WidgetGridItem
                dashboardId={dashboardId}
                instance={instance}
                onRemove={() => removeWidget(dashboardId, instance.instanceId)}
                editable={false}
              />
            </div>
          ))}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      {mounted && (
        <ReactGridLayout
          layout={layout}
          width={width}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight: GRID_ROW_HEIGHT,
            margin: GRID_MARGIN,
            // Otherwise defaults to matching `margin`, stacking another 16px
            // on top of the content column's own padding above — one source
            // of truth for the outer gap is enough.
            containerPadding: [0, 0],
          }}
          dragConfig={{ handle: '.widget-drag-handle' }}
          dropConfig={{
            enabled: true,
            onDragOver: () => {
              const { draggingWidgetId } = useWidgetDragStore.getState()
              if (!draggingWidgetId) return false
              const widget = getWidgetDefinition(draggingWidgetId)
              if (!widget) return false
              return { w: widget.defaultSize.w, h: widget.defaultSize.h }
            },
          }}
          onLayoutChange={(nextLayout) => applyLayoutUpdate(dashboardId, nextLayout)}
          onDrop={(_layout, item) => {
            const { draggingWidgetId } = useWidgetDragStore.getState()
            // `item` is only defined if onDragOver above accepted the drag.
            if (!draggingWidgetId || !item) return
            addWidgetAt(dashboardId, draggingWidgetId, {
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
            })
          }}
          style={
            widgets.length === 0
              ? { minHeight: EMPTY_GRID_MIN_HEIGHT }
              : undefined
          }
        >
          {widgets.map((instance) => (
            <div key={instance.instanceId}>
              <WidgetGridItem
                dashboardId={dashboardId}
                instance={instance}
                onRemove={() => removeWidget(dashboardId, instance.instanceId)}
                editable
              />
            </div>
          ))}
        </ReactGridLayout>
      )}
      {widgets.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-input">
          <p className="text-muted-foreground">
            No widgets yet — drag a tool in from the sidebar, or add tools above.
          </p>
        </div>
      )}
    </div>
  )
}

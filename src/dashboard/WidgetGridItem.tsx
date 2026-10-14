import { useState } from 'react'
import { CopyPlus, Move } from 'lucide-react'
import { WidgetShell } from '@/widget-shell/WidgetShell'
import { GridPositionDialog } from '@/widget-shell/GridPositionDialog'
import { Button } from '@/components/ui/button'
import { WIDGET_REGISTRY } from '@/widgets/registry'
import { useOverlayStore } from '@/overlay/useOverlayStore'
import { useWidgetResetNonce } from '@/widgets/useWidgetDirty'
import type { DashboardWidgetInstance } from '@/types/layout'
import { GRID_COLS, GRID_MAX_ROW_SPAN } from './gridConstants'
import { useDashboardStore } from './useDashboardStore'

interface WidgetGridItemProps {
  /** Which dashboard this instance belongs to — store actions take an
   * explicit dashboard id rather than assuming "the active one". */
  dashboardId: string
  instance: DashboardWidgetInstance
  onRemove: () => void
  /** Whether the surrounding grid is in its draggable/resizable form
   * (desktop/tablet) — the keyboard move/resize dialog is offered here too,
   * as the documented accessible alternative to dragging. On the read-only
   * mobile stack there's no layout to edit, so it's hidden. */
  editable: boolean
}

/** Renders one pinned widget's chrome + content. Content itself lives in
 * `useWidgetState`'s store keyed by instanceId, so this component doesn't
 * need to stay mounted to avoid losing anything — expanding just mounts a
 * second, independent copy in `WidgetOverlay` reading the same instanceId;
 * collapsing lets this one keep showing it. While expanded, this cell shows
 * a placeholder instead of a live second copy, purely to avoid double
 * rendering the same widget on screen at once. */
export function WidgetGridItem({ dashboardId, instance, onRemove, editable }: WidgetGridItemProps) {
  const widget = WIDGET_REGISTRY[instance.widgetId]
  const [positionDialogOpen, setPositionDialogOpen] = useState(false)
  const overlayTarget = useOverlayStore((state) => state.target)
  const expandPinned = useOverlayStore((state) => state.expandPinned)
  const closeOverlay = useOverlayStore((state) => state.close)
  const setWidgetPosition = useDashboardStore((state) => state.setWidgetPosition)
  const duplicateWidget = useDashboardStore((state) => state.duplicateWidget)
  const resetNonce = useWidgetResetNonce(instance.instanceId)

  const isExpanded = overlayTarget?.kind === 'pinned' && overlayTarget.instanceId === instance.instanceId

  if (!widget) return null

  const WidgetComponent = widget.component
  const showMoveControl = editable && !isExpanded

  return (
    <>
      <WidgetShell
        instanceId={instance.instanceId}
        title={widget.name}
        icon={widget.icon}
        dragHandleClassName={isExpanded ? undefined : 'widget-drag-handle cursor-move'}
        isExpanded={isExpanded}
        onToggleExpand={() => (isExpanded ? closeOverlay() : expandPinned(instance.instanceId, widget.id))}
        onRemove={isExpanded ? undefined : onRemove}
        extraActions={
          !isExpanded && (
            <>
              {showMoveControl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setPositionDialogOpen(true)}
                  aria-label={`Move or resize ${widget.name}`}
                  title="Move or resize with the keyboard"
                  className="text-muted-foreground"
                >
                  <Move className="size-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => duplicateWidget(dashboardId, instance.instanceId)}
                aria-label={`Duplicate ${widget.name}`}
                title="Duplicate, including its current content"
                className="text-muted-foreground"
              >
                <CopyPlus className="size-3.5" />
              </Button>
            </>
          )
        }
      >
        {isExpanded ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-input text-xs text-muted-foreground">
            Expanded
          </div>
        ) : (
          <WidgetComponent key={`${instance.instanceId}-${resetNonce}`} instanceId={instance.instanceId} mode="grid" />
        )}
      </WidgetShell>
      {showMoveControl && positionDialogOpen && (
        <GridPositionDialog
          onClose={() => setPositionDialogOpen(false)}
          title={widget.name}
          position={{
            x: instance.x,
            y: instance.y,
            w: instance.w,
            h: instance.h,
          }}
          minSize={widget.minSize ?? { w: 1, h: 1 }}
          maxSize={widget.maxSize ?? { w: GRID_COLS, h: GRID_MAX_ROW_SPAN }}
          cols={GRID_COLS}
          onApply={(next) => setWidgetPosition(dashboardId, instance.instanceId, next)}
        />
      )}
    </>
  )
}

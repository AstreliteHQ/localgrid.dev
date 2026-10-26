import { useState } from 'react'
import { BookmarkCheck } from 'lucide-react'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { findWidgetInstance, useHasWidgetConfig } from '@/widgets/widgetConfig'

interface WidgetConfigIndicatorProps {
  instanceId: string
  title: string
}

/** Shown in a pinned widget's title bar while it holds saved configuration.
 * Deliberately distinct from the dirty dot: config is never lost on reload.
 * Clicking it shows the stored configuration and offers the only per-widget
 * way to reset it. */
export function WidgetConfigIndicator({ instanceId, title }: WidgetConfigIndicatorProps) {
  const hasConfig = useHasWidgetConfig(instanceId)
  const config = useDashboardStore((state) => findWidgetInstance(state.dashboards, instanceId)?.config)
  const resetWidgetConfig = useDashboardStore((state) => state.resetWidgetConfig)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!hasConfig) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setConfirmOpen(true)}
        aria-label={`${title} has saved configuration`}
        title="Configured. Kept on reload and Clear state."
        className="text-muted-foreground"
      >
        <BookmarkCheck className="size-3.5" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title} configuration</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
            <DataTree
              root={buildJsonTree(config)}
              label={`${title} configuration`}
              toolbar={false}
              statusBar={false}
              scroll={false}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                resetWidgetConfig(instanceId)
                setConfirmOpen(false)
              }}
            >
              Reset configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

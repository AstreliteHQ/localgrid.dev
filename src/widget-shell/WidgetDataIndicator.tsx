import { useRef, useState } from 'react'
import { Database } from 'lucide-react'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useWidgetDataSettings } from '@/widgets/useWidgetDataSettings'
import { findWidgetInstance, useHasWidgetData } from '@/widgets/widgetData'
import { WidgetDataRing } from './WidgetDataRing'

interface WidgetDataIndicatorProps {
  instanceId: string
  title: string
}

/** Shown in a pinned widget's title bar while it holds widget data.
 * Deliberately distinct from the dirty dot: widget data is never lost on reload.
 * Clicking it shows the stored data and offers to reset it. Hidden while
 * widget data is turned off, since the widget then ignores what is stored. */
export function WidgetDataIndicator({ instanceId, title }: WidgetDataIndicatorProps) {
  const hasData = useHasWidgetData(instanceId)
  const enabled = useWidgetDataSettings((state) => state.enabled)
  const data = useDashboardStore((state) => findWidgetInstance(state.dashboards, instanceId)?.data)
  const resetWidgetData = useDashboardStore((state) => state.resetWidgetData)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  if (!hasData || !enabled) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setConfirmOpen(true)}
        aria-label={`${title} has saved widget data`}
        title="Saved widget data. Kept on reload and Clear state."
        className="relative text-muted-foreground"
      >
        {/* The ring reaches just past the button, behind the standard size icon. */}
        <WidgetDataRing
          seed={instanceId}
          className="pointer-events-none absolute -top-0.5 -left-0.5 size-[calc(100%+0.25rem)]"
        />
        <Database className="relative size-3.5" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* Focus starts on Close, so Enter never resets by accident. */}
        <DialogContent className="sm:max-w-md" initialFocus={closeRef}>
          <DialogHeader>
            <DialogTitle>{title} data</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
            <DataTree
              root={buildJsonTree(data)}
              label={`${title} data`}
              toolbar={false}
              statusBar={false}
              scroll={false}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetWidgetData(instanceId)
                setConfirmOpen(false)
              }}
            >
              Reset data
            </Button>
            <Button ref={closeRef} size="sm" onClick={() => setConfirmOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

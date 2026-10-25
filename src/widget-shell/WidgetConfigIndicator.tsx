import { useState } from 'react'
import { BookmarkCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { useHasWidgetConfig } from '@/widgets/widgetConfig'

interface WidgetConfigIndicatorProps {
  instanceId: string
  title: string
}

/** Shown in a pinned widget's title bar while it holds saved configuration.
 * Deliberately distinct from the dirty dot: config is never lost on reload.
 * Clicking it offers the only per-widget way to reset that configuration. */
export function WidgetConfigIndicator({ instanceId, title }: WidgetConfigIndicatorProps) {
  const hasConfig = useHasWidgetConfig(instanceId)
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
            <DialogTitle>Reset {title} configuration?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Restores the default settings.</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { WorkspaceLayoutV2 } from '@/types/layout'

interface ShareLoadPromptProps {
  workspace: WorkspaceLayoutV2
  onAccept: () => void
  onDismiss: () => void
}

/** Confirms before a shared link overwrites the visitor's local workspace —
 * never silent. Unlike a single-dashboard share, this replaces *every*
 * dashboard, so it's genuinely destructive again (a single-tab share could
 * safely just add a new tab; a whole-workspace share can't). */
export function ShareLoadPrompt({ workspace, onAccept, onDismiss }: ShareLoadPromptProps) {
  const totalWidgets = workspace.dashboards.reduce(
    (sum, dashboard) => sum + dashboard.widgets.length,
    0,
  )
  const configuredWidgets = workspace.dashboards.reduce(
    (sum, dashboard) => sum + dashboard.widgets.filter((widget) => widget.config).length,
    0,
  )

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDismiss()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Load shared workspace?</DialogTitle>
          <DialogDescription>
            This link contains {workspace.dashboards.length} dashboard
            {workspace.dashboards.length === 1 ? '' : 's'} ({totalWidgets}{' '}
            widget
            {totalWidgets === 1 ? '' : 's'} total). Loading it will{' '}
            <strong className="font-semibold text-foreground">
              replace all of your current dashboards
            </strong>
            .{' '}
            {configuredWidgets > 0
              ? `It also sets up ${configuredWidgets} widget${configuredWidgets === 1 ? '' : 's'} (configuration only, not their content).`
              : 'Only widget placement is shared, not their content.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-wrap gap-1">
          {workspace.dashboards.map((dashboard) => (
            <li
              key={dashboard.id}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {dashboard.name} ({dashboard.widgets.length})
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Keep my dashboards
          </Button>
          <Button size="sm" onClick={onAccept}>
            Load shared workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

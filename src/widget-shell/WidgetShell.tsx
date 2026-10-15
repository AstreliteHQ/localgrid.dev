import { Suspense, type ReactNode } from 'react'
import { Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { useIsWidgetDirty } from '@/widgets/useWidgetDirty'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'

interface WidgetShellProps {
  /** Identifies this widget instance for the dirty-state indicator (pinned
   * widgets use their real instance id; the ephemeral overlay uses a
   * synthetic one — see WidgetOverlay). */
  instanceId: string
  title: string
  /** The widget's own icon from its registry definition, shown before the
   * title. */
  icon?: LucideIcon
  children: ReactNode
  /** Applied to the title bar so react-grid-layout can use it as the drag handle. */
  dragHandleClassName?: string
  isExpanded?: boolean
  /** Toggles between grid and fullscreen-overlay. */
  onToggleExpand?: () => void
  /** Shown instead of expand/collapse for ephemeral (unpinned) tools opened
   * directly into the overlay: closing them discards their content, so the
   * button reads as a close rather than a minimize. */
  onClose?: () => void
  onRemove?: () => void
  /** Extra buttons rendered before the expand/remove actions — e.g. the
   * keyboard move/resize trigger, only relevant while on the grid. */
  extraActions?: ReactNode
}

/** Common chrome wrapping every widget: title bar (doubles as the grid drag
 * handle), expand/collapse and remove actions, loading + error states. */
export function WidgetShell({
  instanceId,
  title,
  icon: Icon,
  children,
  dragHandleClassName,
  isExpanded,
  onToggleExpand,
  onClose,
  onRemove,
  extraActions,
}: WidgetShellProps) {
  const isDirty = useIsWidgetDirty(instanceId)

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm',
        isDirty ? 'animate-dirty-pulse' : 'border-border',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5',
          dragHandleClassName,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-foreground">
          {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
          {isDirty && (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500"
            />
          )}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {extraActions}
          {onToggleExpand && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onToggleExpand}
              aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
              className="text-muted-foreground"
            >
              {isExpanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </Button>
          )}
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              aria-label={`Close ${title}`}
              title="Close (content will be lost)"
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          )}
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRemove}
              aria-label={`Remove ${title}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <WidgetErrorBoundary widgetName={title}>
          <Suspense fallback={<WidgetLoadingFallback />}>{children}</Suspense>
        </WidgetErrorBoundary>
      </div>
    </div>
  )
}

function WidgetLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Loading…
    </div>
  )
}

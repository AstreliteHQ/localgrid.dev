import { useEffect } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/cn'
import { LogoIcon } from '@/components/icons/LogoIcon'
import { WidgetSidebar } from '@/sidebar/WidgetSidebar'
import { useSidebarStore } from '@/sidebar/useSidebarStore'
import { useOverlayStore } from '@/overlay/useOverlayStore'
import { AppHeader } from './AppHeader'
import { GridLayout } from './GridLayout'
import { ShareLoadPrompt } from './ShareLoadPrompt'
import { useDashboardStore } from './useDashboardStore'
import { useShareLinkBootstrap } from './useShareLinkBootstrap'

export function Dashboard() {
  const { pendingWorkspace, decodeError, dismiss } = useShareLinkBootstrap()
  const sidebarCollapsed = useSidebarStore((state) => state.collapsed)
  const toggleSidebar = useSidebarStore((state) => state.toggle)
  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId)
  const importWorkspace = useDashboardStore((state) => state.importWorkspace)
  // Used both to render only the active dashboard's grid and as the effect
  // dependency below — a plain array of ids, kept reference-stable via
  // useShallow so it doesn't re-trigger the effect (or, worse, loop) on
  // every unrelated store read the way a bare `.map()` selector would.
  const activeWidgetIds = useDashboardStore(
    useShallow((state) => {
      const active = state.dashboards.find((dashboard) => dashboard.id === state.activeDashboardId)
      return active?.widgets.map((widget) => widget.instanceId) ?? []
    }),
  )

  // WidgetOverlay lives at the app root, independent of any one dashboard's
  // mount lifecycle — switching tabs alone wouldn't close it. Depending on
  // the active dashboard's widget ids (not just activeDashboardId) also
  // covers importWorkspace, which can swap the whole workspace while
  // coincidentally leaving activeDashboardId unchanged.
  useEffect(() => {
    const target = useOverlayStore.getState().target
    if (target?.kind === 'pinned' && !activeWidgetIds.includes(target.instanceId)) {
      useOverlayStore.getState().close()
    }
  }, [activeWidgetIds])

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden">
      {/* Split in two so the tab bar (inside AppHeader) starts exactly where
          the sidebar ends / the content column begins below — this box is
          only ever as wide as WidgetSidebar itself (same width classes,
          reacting to the same collapsed state), not an approximation. The
          sidebar toggle lives here too, next to the logo, for now — it acts
          on the sidebar right below it either way. */}
      <div className="sticky top-0 z-30 flex h-14 shrink-0">
        <div
          className={cn(
            'hidden shrink-0 items-center gap-1 border-b border-r border-border bg-card px-2 md:flex',
            sidebarCollapsed ? 'md:w-14 md:justify-center' : 'md:w-60',
          )}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand tool sidebar' : 'Collapse tool sidebar'}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
          {!sidebarCollapsed && (
            <a
              href={`${import.meta.env.BASE_URL}about.html`}
              className="flex items-center gap-1.5 px-1"
            >
              <LogoIcon className="size-5 text-foreground" />
              <span className="font-mono text-base font-medium tracking-tight">
                localgrid<span className="text-muted-foreground">.dev</span>
              </span>
            </a>
          )}
        </div>
        <AppHeader />
      </div>

      <div className="flex min-h-0 flex-1">
        <WidgetSidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4 pt-2">
          {/* Only the active dashboard is ever mounted — content survives a
              tab switch via useWidgetState's store, not by staying mounted,
              so there's nothing gained by keeping inactive tabs alive. */}
          <div className="flex flex-1 flex-col">
            <GridLayout key={activeDashboardId} dashboardId={activeDashboardId} />
          </div>

          {decodeError && (
            <p
              role="status"
              aria-live="polite"
              className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground shadow-lg"
            >
              {decodeError}
            </p>
          )}

          {pendingWorkspace && (
            <ShareLoadPrompt
              workspace={pendingWorkspace}
              onAccept={() => {
                importWorkspace(
                  pendingWorkspace.dashboards,
                  pendingWorkspace.activeDashboardId,
                  pendingWorkspace.connections,
                )
                dismiss()
              }}
              onDismiss={dismiss}
            />
          )}
        </div>
      </div>
    </div>
  )
}

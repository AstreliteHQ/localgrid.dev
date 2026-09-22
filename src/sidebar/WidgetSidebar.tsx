import { useMemo, useState } from 'react'
import { Download, Laptop, ListFilter, WifiOff, X, type LucideIcon } from 'lucide-react'
import { AstreliteIcon } from '@/components/icons/AstreliteIcon'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { groupWidgetsByCategory } from '@/widgets/categories'
import { WIDGET_LIST } from '@/widgets/registry'
import type { WidgetDefinition } from '@/widgets/types'
import { useOverlayStore } from '@/overlay/useOverlayStore'
import { useSidebarStore } from './useSidebarStore'
import { useWidgetDragStore } from './useWidgetDragStore'

/** Builds a small icon+name drag image for dataTransfer.setDragImage,
 * instead of the browser's default full-row snapshot (padding, hover
 * background and all). Appended off-screen since browsers need the node
 * present in the document to snapshot it, then removed a tick later — the
 * snapshot itself happens synchronously inside setDragImage. */
function createDragPreview(icon: SVGSVGElement | null, name: string): HTMLElement {
  const preview = document.createElement('div')
  preview.className =
    'pointer-events-none fixed left-[-9999px] top-[-9999px] flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground shadow-md'
  if (icon) {
    const clonedIcon = icon.cloneNode(true) as SVGSVGElement
    clonedIcon.setAttribute('class', 'size-4 shrink-0')
    preview.appendChild(clonedIcon)
  }
  const label = document.createElement('span')
  label.textContent = name
  preview.appendChild(label)
  document.body.appendChild(preview)
  return preview
}

/** True if a widget matches a search query — checked against its name,
 * description, and search keywords, same fields the command palette
 * searches. */
function matchesQuery(widget: WidgetDefinition, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    widget.name.toLowerCase().includes(q) ||
    widget.description.toLowerCase().includes(q) ||
    (widget.keywords?.some((keyword) => keyword.toLowerCase().includes(q)) ?? false)
  )
}

/** Always-visible catalog of every widget, grouped by category — the
 * "browse and reach for a tool" counterpart to the command palette. Click
 * opens a tool fullscreen without pinning it (same ephemeral path the
 * command palette uses); dragging a row onto the grid pins it there
 * instead. Hidden below the grid's own editable breakpoint — mobile already
 * has the command palette for this.
 *
 * Sits below the app header, alongside the main content — collapsed state
 * is toggled from a button in that header (see AppHeader), not from within
 * the sidebar itself. The search box only makes sense expanded — there's no
 * room for it in the icon-only collapsed rail, so it's hidden there and the
 * list falls back to showing every widget. */
export function WidgetSidebar() {
  const collapsed = useSidebarStore((state) => state.collapsed)
  const [query, setQuery] = useState('')

  const filteredWidgets = useMemo(
    () => (collapsed ? WIDGET_LIST : WIDGET_LIST.filter((widget) => matchesQuery(widget, query))),
    [collapsed, query],
  )
  const groups = useMemo(() => groupWidgetsByCategory(filteredWidgets), [filteredWidgets])

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-card md:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {!collapsed && (
        <div className="shrink-0 border-b border-border p-2">
          <div className="relative">
            <ListFilter className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter tools..."
              aria-label="Filter tools"
              className="h-7 pl-7 pr-6 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear filter"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">No tools found</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.category}>
                {!collapsed && (
                  <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {group.widgets.map((widget) => (
                    <SidebarWidgetItem
                      key={widget.id}
                      widget={widget}
                      collapsed={collapsed}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stacked icon+label badges don't fit the icon-only rail, and aren't
       * worth showing squeezed there — skip the footer entirely when
       * collapsed rather than cramming it in. */}
      {!collapsed && <BrandFooter />}
    </aside>
  )
}

function SidebarWidgetItem({
  widget,
  collapsed,
}: {
  widget: WidgetDefinition
  collapsed: boolean
}) {
  const Icon = widget.icon
  const openEphemeral = useOverlayStore((state) => state.openEphemeral)
  const startDragging = useWidgetDragStore((state) => state.startDragging)
  const stopDragging = useWidgetDragStore((state) => state.stopDragging)

  const handleOpen = () => openEphemeral(widget.id)

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(event) => {
          startDragging(widget.id)
          event.dataTransfer.setData('text/plain', widget.id)
          event.dataTransfer.effectAllowed = 'copy'
          const icon = event.currentTarget.querySelector('svg')
          const preview = createDragPreview(icon, widget.name)
          event.dataTransfer.setDragImage(preview, 12, 12)
          requestAnimationFrame(() => preview.remove())
        }}
        onDragEnd={stopDragging}
        onClick={handleOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleOpen()
          }
        }}
        title={collapsed ? widget.name : undefined}
        aria-label={`Open ${widget.name} fullscreen — drag onto the dashboard to pin it there instead`}
        className={cn(
          'flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-accent active:cursor-grabbing',
          collapsed && 'justify-center',
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{widget.name}</span>}
      </div>
    </li>
  )
}

/** Fixed panel pinned below the (independently scrolling) widget list —
 * a "works offline" callout plus attribution back to the Astrelite site,
 * not part of the tool catalog so it never scrolls out of view with it.
 * Only ever rendered expanded — the caller skips it when the sidebar is
 * collapsed, since it doesn't fit the icon-only rail. */
function BrandFooter() {
  return (
    <div className="shrink-0 border-t border-border p-2">
      <div className="flex items-center gap-3 px-1 py-1">
        <CapabilityBadge icon={WifiOff} label="Offline" />
        <CapabilityBadge icon={Laptop} label="Run locally" />
        <CapabilityBadge icon={Download} label="Installable" />
      </div>
      <a
        href="https://astrelite.com"
        target="_blank"
        rel="noreferrer"
        title="Astrelite"
        className="flex items-center gap-1.5 rounded-md px-1 py-1 text-foreground hover:bg-accent"
      >
        <AstreliteIcon className="size-3.5 shrink-0" />
        <span className="text-[10px] font-medium tracking-widest uppercase">Astrelite</span>
      </a>
      <p className="px-1 text-[9px] text-muted-foreground/50">v{__APP_VERSION__}</p>
    </div>
  )
}

/** One static, muted capability badge in the footer's shared row (e.g.
 * "Offline", "Installable") — not interactive, just a quiet statement of
 * what's already true about this app rather than a control. */
function CapabilityBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
      <Icon className="size-3 shrink-0" />
      <span>{label}</span>
    </div>
  )
}

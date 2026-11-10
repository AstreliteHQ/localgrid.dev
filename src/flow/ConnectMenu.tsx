import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { getWidgetDefinition } from '@/widgets/registry'
import { canConnect } from './linkGraph'
import { useFlowStore } from './useFlowStore'

const MENU_WIDTH = 224

/** Opened by tapping or clicking a widget's OUT tab: lists every input on
 * the same dashboard this output can feed, so links can be made without
 * dragging a wire (phones, the stacked layout, keyboard). Picking a row
 * connects it, picking a row this widget already feeds disconnects it. */
export function ConnectMenu() {
  const menu = useFlowStore((state) => state.connectMenu)
  const links = useFlowStore((state) => state.links)
  const closeConnectMenu = useFlowStore((state) => state.closeConnectMenu)
  const widgets = useDashboardStore(
    (state) =>
      state.dashboards.find((dashboard) => dashboard.widgets.some((w) => w.instanceId === menu?.from))?.widgets,
  )

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConnectMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, closeConnectMenu])

  if (!menu || !widgets) return null
  const { from } = menu
  const { connect, disconnect } = useFlowStore.getState()

  // Same order as the stacked layout. Repeated widgets are numbered in that
  // order ("Base64 2") so each row can be told apart.
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x)
  const total = new Map<string, number>()
  for (const widget of sorted) total.set(widget.widgetId, (total.get(widget.widgetId) ?? 0) + 1)
  const nth = new Map<string, number>()
  const rows = sorted.flatMap((widget) => {
    nth.set(widget.widgetId, (nth.get(widget.widgetId) ?? 0) + 1)
    const definition = getWidgetDefinition(widget.widgetId)
    if (!definition?.flow?.inputs || widget.instanceId === from) return []
    const name = total.get(widget.widgetId)! > 1 ? `${definition.name} ${nth.get(widget.widgetId)}` : definition.name
    return definition.flow.inputs.map((input) => ({ to: widget.instanceId, name, input }))
  })

  return (
    <>
      <div data-flow-overlay className="fixed inset-0 z-40" onPointerDown={closeConnectMenu} />
      <div
        data-flow-overlay
        role="menu"
        aria-label="Connect output to"
        style={{
          left: Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8)),
          top: menu.y,
          width: MENU_WIDTH,
        }}
        className="fixed z-50 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      >
        <p className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">Connect to</p>
        {rows.length === 0 && <p className="px-2 py-1 text-muted-foreground">No widget with an input here</p>}
        {rows.map(({ to, name, input }) => {
          const linked = links.some((link) => link.from === from && link.to === to && link.input === input.field)
          return (
            <button
              key={`${to}:${input.field}`}
              type="button"
              role="menuitemcheckbox"
              aria-checked={linked}
              disabled={!linked && !canConnect(links, from, to, input.field)}
              onClick={() => {
                if (linked) disconnect(to, input.field)
                else connect(from, to, input.field)
                closeConnectMenu()
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span className="truncate">
                {name}
                <span className="ml-1 text-muted-foreground">({input.label})</span>
              </span>
              {linked && <Check className="size-3 shrink-0" />}
            </button>
          )
        })}
      </div>
    </>
  )
}

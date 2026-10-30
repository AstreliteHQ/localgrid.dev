import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WidgetInput } from '@/widgets/types'
import { canConnect, readableTextColor } from './connectionGraph'
import { useConnectionStore } from './useConnectionStore'
import { useConnectorColor } from './useConnectorSettings'
import { useInstanceDefinition } from './useInstanceDefinition'

/** Small list of a widget's inputs. Picks the input for a dropped connection
 * when the drop alone was ambiguous, or shows what feeds each input with a
 * way to disconnect it. */
export function InputMenu() {
  const menu = useConnectionStore((state) => state.menu)
  const closeMenu = useConnectionStore((state) => state.closeMenu)
  const inputs = useInstanceDefinition(menu?.to)?.connectors?.inputs

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, closeMenu])

  if (!menu || !inputs) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={closeMenu} />
      <div
        role="menu"
        aria-label={menu.from ? 'Connect to input' : 'Inputs'}
        style={{ left: menu.x, top: menu.y }}
        className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      >
        <p className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">
          {menu.from ? 'Connect to' : 'Inputs'}
        </p>
        {inputs.map((input) => (
          <InputMenuRow key={input.field} to={menu.to} from={menu.from} input={input} />
        ))}
      </div>
    </>
  )
}

function InputMenuRow({ to, from, input }: { to: string; from?: string; input: WidgetInput }) {
  const link = useConnectionStore((state) =>
    state.connections.find((connection) => connection.to === to && connection.input === input.field),
  )
  const allowed = useConnectionStore(
    (state) => from !== undefined && canConnect(state.connections, from, to, input.field),
  )
  const { connect, disconnect, closeMenu } = useConnectionStore.getState()
  const sourceName = useInstanceDefinition(link?.from)?.name

  const color = useConnectorColor(link?.from)
  const source = color && (
    <span
      style={{ backgroundColor: color, color: readableTextColor(color) }}
      className="truncate rounded-full px-1.5 font-mono text-[9px] leading-3.5 font-bold"
    >
      ← {sourceName ?? 'connected'}
    </span>
  )

  if (from !== undefined) {
    return (
      <button
        type="button"
        role="menuitem"
        disabled={!allowed}
        onClick={() => {
          connect(from, to, input.field)
          closeMenu()
        }}
        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <span>{input.label}</span>
        {source}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded px-2 py-1">
      <span>{input.label}</span>
      {link ? (
        <span className="flex min-w-0 items-center gap-1">
          {source}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Disconnect ${input.label}`}
            onClick={() => disconnect(to, input.field)}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3" />
          </Button>
        </span>
      ) : (
        <span className="text-muted-foreground">not connected</span>
      )}
    </div>
  )
}

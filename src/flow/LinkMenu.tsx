import { useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { autoLinkColor, linkKey } from './linkGraph'
import { useFlowStore } from './useFlowStore'
import { useFlowSettings } from './useFlowSettings'
import { useInstanceDefinition } from './useInstanceDefinition'

const MENU_WIDTH = 224
const MENU_HEIGHT = 140

/** Opened by clicking a wire: picks the link's color from the palette (or
 * back to its source's color) and removes the link. */
export function LinkMenu() {
  const menu = useFlowStore((state) => state.linkMenu)
  const link = useFlowStore((state) =>
    state.linkMenu ? state.links.find((link) => linkKey(link) === state.linkMenu?.key) : undefined,
  )
  const colors = useFlowSettings((state) => state.colors)
  const sourceName = useInstanceDefinition(link?.from)?.name
  const target = useInstanceDefinition(link?.to)
  const { closeLinkMenu, setLinkColor, disconnect } = useFlowStore.getState()

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLinkMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, closeLinkMenu])

  if (!menu || !link) return null

  const inputLabel = target?.flow?.inputs?.find((input) => input.field === link.input)?.label ?? link.input
  const sourceColor = autoLinkColor(link.from, colors)

  return (
    <>
      <div data-flow-overlay className="fixed inset-0 z-40" onPointerDown={closeLinkMenu} />
      <div
        data-flow-overlay
        role="dialog"
        aria-label="Link"
        // Kept inside the viewport when the click was near an edge.
        style={{
          left: Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8)),
          top: Math.max(8, Math.min(menu.y, window.innerHeight - MENU_HEIGHT - 8)),
          width: MENU_WIDTH,
        }}
        className="fixed z-50 flex flex-col gap-2 rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground shadow-md"
      >
        <p className="truncate px-1">
          {sourceName ?? 'Source'} → {target?.name ?? 'Target'}
          <span className="ml-1 text-muted-foreground">({inputLabel})</span>
        </p>
        <div className="flex flex-col gap-1 px-1">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Color</p>
          <div role="radiogroup" aria-label="Link color" className="flex items-center gap-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={link.color === undefined}
              aria-label="Source color"
              title="Same color as the other wires from this widget"
              onClick={() => setLinkColor(link.to, link.input, undefined)}
              className={cn(
                'flex h-5 items-center gap-1 rounded-full border border-border px-1.5 text-[10px]',
                link.color === undefined && 'ring-2 ring-foreground ring-offset-1 ring-offset-popover',
              )}
            >
              <span style={{ backgroundColor: sourceColor }} className="size-2 rounded-full" />
              Auto
            </button>
            {colors.map((color, index) => (
              <button
                key={index}
                type="button"
                role="radio"
                aria-checked={link.color === index}
                aria-label={`Color ${index + 1}`}
                onClick={() => setLinkColor(link.to, link.input, index)}
                style={{ backgroundColor: color }}
                className={cn(
                  'size-5 rounded-full',
                  link.color === index && 'ring-2 ring-foreground ring-offset-1 ring-offset-popover',
                )}
              />
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            disconnect(link.to, link.input)
            closeLinkMenu()
          }}
          className="justify-start text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Remove link
        </Button>
      </div>
    </>
  )
}

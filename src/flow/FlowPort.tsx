import { useContext } from 'react'
import { cn } from '@/lib/utils'
import type { WidgetInput } from '@/widgets/types'
import { canConnect, linkKey, readableTextColor } from './linkGraph'
import { HEADER_ANCHOR_Y } from './linkRouting'
import { FlowInstanceContext } from './flowContext'
import { useFlowStore } from './useFlowStore'
import { useLinkColor } from './useFlowSettings'

type FlowPortProps =
  | { instanceId: string; kind: 'input'; inputs: WidgetInput[]; draggable?: undefined }
  | { instanceId: string; kind: 'output'; inputs?: undefined; draggable: boolean }

/** Labeled IN / OUT tab on a widget's header border, where wires attach.
 * Drag from OUT onto another widget to connect (`draggable`, the editable
 * grid only), or click it to pick a target from a menu. Clicking IN
 * disconnects a single input, or lists them when there are several.
 * Rendered by the grid item, outside the widget's own scroll. */
export function FlowPort({ instanceId, kind, inputs, draggable }: FlowPortProps) {
  const enabled = useContext(FlowInstanceContext) !== null
  const end = (link: { from: string; to: string }) => (kind === 'input' ? link.to : link.from)
  const link = useFlowStore((state) => state.links.find((link) => end(link) === instanceId))
  const isHovered = useFlowStore((state) =>
    state.links.some((link) => end(link) === instanceId && linkKey(link) === state.hovered),
  )
  const isDropTarget = useFlowStore(
    (state) =>
      state.drag !== null &&
      (inputs ?? []).some((input) => canConnect(state.links, state.drag!.from, instanceId, input.field)),
  )
  const color = useLinkColor(link)
  const { startDrag, disconnect, openMenu, openConnectMenu } = useFlowStore.getState()

  if (!enabled) return null

  const single = inputs?.length === 1 ? inputs[0] : undefined
  const label = kind === 'output' ? 'Output port' : single ? (link ? 'Disconnect input' : 'Input port') : 'Inputs'

  return (
    <button
      type="button"
      data-flow-port={kind}
      data-flow-instance={instanceId}
      aria-label={label}
      title={
        kind === 'output'
          ? draggable
            ? 'Output: drag onto another widget, or click to pick one'
            : 'Output: tap to connect to another widget'
          : single
            ? link
              ? 'Connected, click to disconnect'
              : 'Input: drop a link here'
            : `${inputs?.length ?? 0} inputs: click to see what feeds them`
      }
      onPointerDown={
        draggable
          ? (event) => {
              event.preventDefault()
              startDrag(instanceId)
            }
          : undefined
      }
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        // A click is a press released on the tab itself, so it never follows a real drag.
        if (kind === 'output') return openConnectMenu({ from: instanceId, x: rect.right, y: rect.bottom + 4 })
        if (single) {
          if (link) disconnect(instanceId, single.field)
          return
        }
        openMenu({ to: instanceId, x: rect.left, y: rect.bottom + 4 })
      }}
      style={{ top: HEADER_ANCHOR_Y, ...(color && { backgroundColor: color, color: readableTextColor(color) }) }}
      className={cn(
        'absolute z-10 flex h-4 -translate-y-1/2 touch-none items-center rounded-full border px-1 font-mono text-[9px] leading-none font-bold tracking-wide select-none',
        kind === 'input' ? '-left-1.5' : '-right-1.5 cursor-crosshair',
        color ? 'border-transparent' : 'border-border bg-background text-muted-foreground hover:text-foreground',
        isHovered && 'ring-2 ring-foreground/40',
        isDropTarget && 'animate-pulse ring-2 ring-primary',
      )}
    >
      {kind === 'input' ? 'IN' : 'OUT'}
    </button>
  )
}

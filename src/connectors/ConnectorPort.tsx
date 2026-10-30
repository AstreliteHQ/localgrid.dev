import { useContext } from 'react'
import { cn } from '@/lib/utils'
import type { WidgetInput } from '@/widgets/types'
import { canConnect, connectionKey, readableTextColor } from './connectionGraph'
import { HEADER_ANCHOR_Y } from './connectionRouting'
import { ConnectorInstanceContext } from './connectorsContext'
import { useConnectionStore } from './useConnectionStore'
import { useConnectorColor } from './useConnectorSettings'

type ConnectorPortProps =
  | { instanceId: string; kind: 'input'; inputs: WidgetInput[] }
  | { instanceId: string; kind: 'output'; inputs?: undefined }

/** Labeled IN / OUT tab on a widget's header border, where wires attach.
 * Drag from OUT onto another widget to connect. Clicking IN disconnects a
 * single input, or lists them when there are several. Rendered by the grid
 * item, outside the widget's own scroll. */
export function ConnectorPort({ instanceId, kind, inputs }: ConnectorPortProps) {
  const enabled = useContext(ConnectorInstanceContext) !== null
  const end = (connection: { from: string; to: string }) => (kind === 'input' ? connection.to : connection.from)
  const link = useConnectionStore((state) => state.connections.find((connection) => end(connection) === instanceId))
  const isHovered = useConnectionStore((state) =>
    state.connections.some(
      (connection) => end(connection) === instanceId && connectionKey(connection) === state.hovered,
    ),
  )
  const isDropTarget = useConnectionStore(
    (state) =>
      state.drag !== null &&
      (inputs ?? []).some((input) => canConnect(state.connections, state.drag!.from, instanceId, input.field)),
  )
  const color = useConnectorColor(link?.from)
  const { startDrag, disconnect, openMenu } = useConnectionStore.getState()

  if (!enabled) return null

  const single = inputs?.length === 1 ? inputs[0] : undefined
  const label =
    kind === 'output' ? 'Output connector' : single ? (link ? 'Disconnect input' : 'Input connector') : 'Inputs'

  return (
    <button
      type="button"
      data-connector-port={kind}
      data-connector-instance={instanceId}
      aria-label={label}
      title={
        kind === 'output'
          ? 'Output: drag onto another widget to connect'
          : single
            ? link
              ? 'Connected, click to disconnect'
              : 'Input: drop a connection here'
            : `${inputs?.length ?? 0} inputs: click to see what feeds them`
      }
      onPointerDown={
        kind === 'output'
          ? (event) => {
              event.preventDefault()
              startDrag(instanceId)
            }
          : undefined
      }
      onClick={
        kind === 'input'
          ? (event) => {
              if (single) {
                if (link) disconnect(instanceId, single.field)
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              openMenu({ to: instanceId, x: rect.left, y: rect.bottom + 4 })
            }
          : undefined
      }
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

import { useContext, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { canConnect, connectionKey, readableTextColor } from './connectionGraph'
import { ConnectorInstanceContext } from './connectorsContext'
import { useConnectionStore } from './useConnectionStore'
import { useConnectorColor, useConnectorSettings } from './useConnectorSettings'
import { useInstanceDefinition } from './useInstanceDefinition'

interface SlotProps {
  className?: string
  /** The UI field this slot marks. Without children, the slot is a
   * positioned region over part of another element (e.g. one pane of a
   * split editor) and lets pointer events through. */
  children?: ReactNode
}

interface InputSlotProps extends SlotProps {
  /** A `field` declared in the widget's `connectors.inputs`. */
  input: string
}

/** Marks the UI field fed by one declared input. Inside the editable grid it
 * shows the field's connection state, a drop zone while a connection is
 * dragged, and an outline while its wire is hovered. Elsewhere it renders
 * only its children. Widgets need nothing else: values arrive through the
 * input's `useWidgetState` field. */
export function InputSlot({ input, className, children }: InputSlotProps) {
  const instanceId = useContext(ConnectorInstanceContext)
  const wrapperClassName = cn('relative', !children && 'pointer-events-none', className)
  if (!instanceId) return children ? <div className={wrapperClassName}>{children}</div> : null
  return (
    <div className={wrapperClassName} data-connector-slot={input}>
      {children}
      <InputSlotOverlay instanceId={instanceId} input={input} />
    </div>
  )
}

function InputSlotOverlay({ instanceId, input }: { instanceId: string; input: string }) {
  const definition = useInstanceDefinition(instanceId)
  const link = useConnectionStore((state) =>
    state.connections.find((connection) => connection.to === instanceId && connection.input === input),
  )
  const isHovered = useConnectionStore((state) => link !== undefined && state.hovered === connectionKey(link))
  const isDropTarget = useConnectionStore(
    (state) => state.drag !== null && canConnect(state.connections, state.drag.from, instanceId, input),
  )
  const sourceName = useInstanceDefinition(link?.from)?.name
  const declared = definition?.connectors?.inputs?.find((candidate) => candidate.field === input)

  useEffect(() => {
    if (import.meta.env.DEV && definition && !declared) {
      console.warn(`InputSlot "${input}" is not declared in ${definition.id} connectors.inputs`)
    }
  }, [definition, declared, input])

  const color = useConnectorColor(link?.from)
  const showSourceLabels = useConnectorSettings((state) => state.showSourceLabels)

  return (
    <>
      {color && showSourceLabels ? (
        <span
          style={{ backgroundColor: color, color: readableTextColor(color) }}
          className="pointer-events-none absolute -top-1.5 left-2 z-20 max-w-[80%] truncate rounded-full px-1.5 font-mono text-[9px] leading-3.5 font-bold"
        >
          ← {sourceName ?? 'connected'}
        </span>
      ) : (
        <SlotDot color={color} className="-left-1.5" />
      )}
      {isHovered && color && <HoverOutline color={color} />}
      {isDropTarget && (
        <div
          data-connector-drop-input={input}
          data-connector-instance={instanceId}
          className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/80 text-xs font-medium text-foreground"
        >
          {declared?.label ?? input}
        </div>
      )}
    </>
  )
}

/** Marks the UI field showing the widget's output (the value passed to
 * `useWidgetOutput`). Purely visual. */
export function OutputSlot({ className, children }: SlotProps) {
  const instanceId = useContext(ConnectorInstanceContext)
  const wrapperClassName = cn('relative', !children && 'pointer-events-none', className)
  if (!instanceId) return children ? <div className={wrapperClassName}>{children}</div> : null
  return (
    <div className={wrapperClassName} data-connector-slot="output">
      {children}
      <OutputSlotOverlay instanceId={instanceId} />
    </div>
  )
}

function OutputSlotOverlay({ instanceId }: { instanceId: string }) {
  const link = useConnectionStore((state) => state.connections.find((connection) => connection.from === instanceId))
  const isHovered = useConnectionStore((state) =>
    state.connections.some(
      (connection) => connection.from === instanceId && connectionKey(connection) === state.hovered,
    ),
  )
  const color = useConnectorColor(link?.from)

  return (
    <>
      <SlotDot color={color} className="-right-1.5" />
      {isHovered && color && <HoverOutline color={color} />}
    </>
  )
}

function SlotDot({ color, className }: { color?: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      style={color ? { backgroundColor: color } : undefined}
      className={cn(
        'pointer-events-none absolute top-3 z-20 size-2 -translate-y-1/2 rounded-full border',
        color ? 'border-transparent' : 'border-muted-foreground/60 bg-background',
        className,
      )}
    />
  )
}

// Stacking inside a slot: hover outline (z-10) under the source label and
// dots (z-20), all under the drop zone shown while dragging (z-30).
function HoverOutline({ color }: { color: string }) {
  return (
    <span
      style={{ boxShadow: `0 0 0 2px ${color}` }}
      className="pointer-events-none absolute inset-0 z-10 rounded-md"
    />
  )
}

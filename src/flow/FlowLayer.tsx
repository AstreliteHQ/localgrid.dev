import { useEffect, useMemo, useRef, useState } from 'react'
import type { Layout } from 'react-grid-layout'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { canConnect, linkKey, linkColor } from './linkGraph'
import { distanceToRoute, outputAnchor, routeLink, type GridGeometry, type Point } from './linkRouting'
import { CONVEYOR_WIDTH, Conveyor } from './Conveyor'
import { InputMenu } from './InputMenu'
import { LinkMenu } from './LinkMenu'
import { useFlowStore } from './useFlowStore'
import { useFlowSettings } from './useFlowSettings'
import { instanceDefinition } from './useInstanceDefinition'

interface FlowLayerProps {
  /** Current grid layout, live while a widget is being dragged or resized. */
  layout: Layout
  /** Grid container width in pixels. */
  width: number
  cols: number
  rowHeight: number
  margin: number
}

/** Connects a dropped wire. A drop on an input slot picks that input. A drop
 * anywhere else on a widget picks its only input, or its only free one, and
 * otherwise asks with the input menu. */
function resolveDrop(from: string, x: number, y: number) {
  const { links, connect, openMenu } = useFlowStore.getState()
  const target = document.elementFromPoint(x, y)
  const zone = target?.closest<HTMLElement>('[data-flow-drop-input]')
  if (zone?.dataset.flowInstance && zone.dataset.flowDropInput) {
    connect(from, zone.dataset.flowInstance, zone.dataset.flowDropInput)
    return
  }
  const port =
    target?.closest<HTMLElement>('[data-flow-port="input"]') ??
    target?.closest('.react-grid-item')?.querySelector<HTMLElement>('[data-flow-port="input"]')
  const to = port?.dataset.flowInstance
  if (!to) return
  const inputs = instanceDefinition(to)?.flow?.inputs ?? []
  const allowed = inputs.filter((input) => canConnect(links, from, to, input.field))
  const free = allowed.filter((input) => !links.some((link) => link.to === to && link.input === input.field))
  const pick = inputs.length === 1 ? allowed[0] : free.length === 1 ? free[0] : undefined
  if (pick) connect(from, to, pick.field)
  else if (allowed.length > 0) openMenu({ to, from, x, y })
}

/** Conveyor-style wires between connected widgets, routed through the gaps
 * of the grid and computed from the layout alone. Drawn below the widgets so
 * the header IN / OUT tabs sit on top of the wire ends, which is why hover is
 * detected by distance rather than pointer events. Must sit in the same
 * positioned container as the grid, before it. */
export function FlowLayer({ layout, width, cols, rowHeight, margin }: FlowLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const links = useFlowStore((state) => state.links)
  const dragFrom = useFlowStore((state) => state.drag?.from)
  const [pointer, setPointer] = useState<Point | null>(null)
  const hovered = useFlowStore((state) => state.hovered)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const colors = useFlowSettings((state) => state.colors)
  const animation = useFlowSettings((state) => state.animation)

  const geometry: GridGeometry = useMemo(
    () => ({ cols, rowHeight, margin, colWidth: (width - margin * (cols - 1)) / cols }),
    [cols, rowHeight, margin, width],
  )
  const rects = useMemo(() => new Map(layout.map((item) => [item.i, item])), [layout])

  const wires = useMemo(
    () =>
      links.flatMap((link, index) => {
        const from = rects.get(link.from)
        const to = rects.get(link.to)
        if (!from || !to) return []
        // Small shift so wires sharing a gap still show both edges.
        const lane = ((index % 3) - 1) * 2
        const points = routeLink(from, to, layout, geometry, lane)
        return [{ key: linkKey(link), points, color: linkColor(link, colors) }]
      }),
    [links, rects, layout, geometry, colors],
  )

  useEffect(() => {
    const container = svgRef.current?.parentElement
    if (!container || wires.length === 0) return
    const { setHovered, openLinkMenu } = useFlowStore.getState()
    const wireAt = (event: PointerEvent) => {
      const origin = svgRef.current?.getBoundingClientRect()
      if (!origin) return undefined
      const point = { x: event.clientX - origin.left, y: event.clientY - origin.top }
      return wires.find((wire) => distanceToRoute(point, wire.points) <= CONVEYOR_WIDTH / 2 + 1)?.key
    }
    // Only a press in the empty gaps opens a wire's menu: never one on a
    // widget, its tabs or an open flow menu.
    const inGap = (event: PointerEvent) =>
      !(event.target as Element | null)?.closest('.react-grid-item, [data-flow-overlay]')
    // Down and up on the same wire, rather than `click`: after a widget drag,
    // `click` fires on the grid container and would look like a wire click.
    let pressed: string | undefined
    const onMove = (event: PointerEvent) => {
      const key = wireAt(event)
      setHovered(key ?? null)
      container.style.cursor = key && inGap(event) ? 'pointer' : ''
    }
    const onDown = (event: PointerEvent) => {
      pressed = inGap(event) ? wireAt(event) : undefined
    }
    const onUp = (event: PointerEvent) => {
      const key = inGap(event) ? wireAt(event) : undefined
      if (pressed && key === pressed && !useFlowStore.getState().drag) {
        openLinkMenu({ key, x: event.clientX, y: event.clientY })
      }
      pressed = undefined
    }
    const onLeave = () => {
      setHovered(null)
      container.style.cursor = ''
    }
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointerleave', onLeave)
    return () => {
      onLeave()
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointerleave', onLeave)
    }
  }, [wires])

  useEffect(() => {
    if (dragFrom === undefined) return
    const { endDrag } = useFlowStore.getState()
    const onMove = (event: PointerEvent) => {
      const origin = svgRef.current?.getBoundingClientRect()
      if (origin) setPointer({ x: event.clientX - origin.left, y: event.clientY - origin.top })
    }
    const onUp = (event: PointerEvent) => {
      // Resolved before ending the drag, while the slot drop zones still exist.
      resolveDrop(dragFrom, event.clientX, event.clientY)
      endDrag()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endDrag()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endDrag)
    window.addEventListener('keydown', onKey)
    return () => {
      setPointer(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', endDrag)
      window.removeEventListener('keydown', onKey)
    }
  }, [dragFrom])

  const dragRect = dragFrom !== undefined ? rects.get(dragFrom) : undefined
  const dragStart = dragRect && outputAnchor(dragRect, geometry)

  return (
    <>
      <svg ref={svgRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        {wires.map((wire) => {
          const isHovered = wire.key === hovered
          const isMoving = !reduceMotion && (animation === 'always' || (animation === 'hover' && isHovered))
          return (
            <g key={wire.key} data-flow-wire={wire.key} data-hovered={isHovered || undefined}>
              <Conveyor
                id={`flow-wire-${wire.key}`}
                points={wire.points}
                color={wire.color}
                highlighted={isHovered}
                moving={isMoving}
              />
            </g>
          )
        })}
      </svg>
      {dragStart && pointer && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible">
          <path
            d={`M ${dragStart.x} ${dragStart.y} C ${dragStart.x + 60} ${dragStart.y}, ${pointer.x - 60} ${pointer.y}, ${pointer.x} ${pointer.y}`}
            fill="none"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            className="stroke-muted-foreground"
          />
        </svg>
      )}
      <InputMenu />
      <LinkMenu />
    </>
  )
}

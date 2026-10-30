import { useEffect, useMemo, useRef, useState } from 'react'
import type { Layout } from 'react-grid-layout'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { canConnect, connectionColor, connectionKey } from './connectionGraph'
import {
  distanceToRoute,
  outputAnchor,
  roundedPath,
  routeConnection,
  type GridGeometry,
  type Point,
} from './connectionRouting'
import { InputMenu } from './InputMenu'
import { useConnectionStore } from './useConnectionStore'
import { useConnectorSettings } from './useConnectorSettings'
import { instanceDefinition } from './useInstanceDefinition'

interface ConnectionLayerProps {
  /** Current grid layout, live while a widget is being dragged or resized. */
  layout: Layout
  /** Grid container width in pixels. */
  width: number
  cols: number
  rowHeight: number
  margin: number
}

/** Conveyor band width, a bit under the 16px grid gap. */
const BAND_WIDTH = 12
// One `>` every 12px: a 10px JetBrains Mono glyph is 6px wide, plus 6px of
// letter spacing. Scrolling by exactly one step makes the loop seamless.
const GLYPH_SIZE = 10
const GLYPH_SPACING = 6
const GLYPH_STEP = GLYPH_SIZE * 0.6 + GLYPH_SPACING

/** Connects a dropped wire. A drop on an input slot picks that input. A drop
 * anywhere else on a widget picks its only input, or its only free one, and
 * otherwise asks with the input menu. */
function resolveDrop(from: string, x: number, y: number) {
  const { connections, connect, openMenu } = useConnectionStore.getState()
  const target = document.elementFromPoint(x, y)
  const zone = target?.closest<HTMLElement>('[data-connector-drop-input]')
  if (zone?.dataset.connectorInstance && zone.dataset.connectorDropInput) {
    connect(from, zone.dataset.connectorInstance, zone.dataset.connectorDropInput)
    return
  }
  const port =
    target?.closest<HTMLElement>('[data-connector-port="input"]') ??
    target?.closest('.react-grid-item')?.querySelector<HTMLElement>('[data-connector-port="input"]')
  const to = port?.dataset.connectorInstance
  if (!to) return
  const inputs = instanceDefinition(to)?.connectors?.inputs ?? []
  const allowed = inputs.filter((input) => canConnect(connections, from, to, input.field))
  const free = allowed.filter((input) => !connections.some((link) => link.to === to && link.input === input.field))
  const pick = inputs.length === 1 ? allowed[0] : free.length === 1 ? free[0] : undefined
  if (pick) connect(from, to, pick.field)
  else if (allowed.length > 0) openMenu({ to, from, x, y })
}

function routeLength(points: readonly Point[]): number {
  let length = 0
  for (let i = 0; i < points.length - 1; i++)
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  return length
}

/** Conveyor-style wires between connected widgets, routed through the gaps
 * of the grid and computed from the layout alone. Drawn below the widgets so
 * the header IN / OUT tabs sit on top of the wire ends, which is why hover is
 * detected by distance rather than pointer events. Must sit in the same
 * positioned container as the grid, before it. */
export function ConnectionLayer({ layout, width, cols, rowHeight, margin }: ConnectionLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const connections = useConnectionStore((state) => state.connections)
  const dragFrom = useConnectionStore((state) => state.drag?.from)
  const [pointer, setPointer] = useState<Point | null>(null)
  const hovered = useConnectionStore((state) => state.hovered)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const colors = useConnectorSettings((state) => state.colors)
  const animation = useConnectorSettings((state) => state.animation)

  const geometry: GridGeometry = useMemo(
    () => ({ cols, rowHeight, margin, colWidth: (width - margin * (cols - 1)) / cols }),
    [cols, rowHeight, margin, width],
  )
  const rects = useMemo(() => new Map(layout.map((item) => [item.i, item])), [layout])

  const wires = useMemo(
    () =>
      connections.flatMap((link, index) => {
        const from = rects.get(link.from)
        const to = rects.get(link.to)
        if (!from || !to) return []
        // Small shift so wires sharing a gap still show both edges.
        const lane = ((index % 3) - 1) * 2
        const points = routeConnection(from, to, layout, geometry, lane)
        return [
          {
            key: connectionKey(link),
            points,
            d: roundedPath(points),
            glyphs: '>'.repeat(Math.ceil(routeLength(points) / GLYPH_STEP)),
            color: connectionColor(link.from, colors),
          },
        ]
      }),
    [connections, rects, layout, geometry, colors],
  )

  useEffect(() => {
    const container = svgRef.current?.parentElement
    if (!container || wires.length === 0) return
    const { setHovered } = useConnectionStore.getState()
    const onMove = (event: PointerEvent) => {
      const origin = svgRef.current?.getBoundingClientRect()
      if (!origin) return
      const point = { x: event.clientX - origin.left, y: event.clientY - origin.top }
      const hit = wires.find((wire) => distanceToRoute(point, wire.points) <= BAND_WIDTH / 2 + 1)
      setHovered(hit?.key ?? null)
    }
    const onLeave = () => setHovered(null)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerleave', onLeave)
    return () => {
      setHovered(null)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerleave', onLeave)
    }
  }, [wires])

  useEffect(() => {
    if (dragFrom === undefined) return
    const { endDrag } = useConnectionStore.getState()
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
          const pathId = `connector-wire-${wire.key.replace(':', '-')}`
          return (
            <g key={wire.key} data-connector-wire={wire.key} data-hovered={isHovered || undefined}>
              <path
                id={pathId}
                d={wire.d}
                fill="none"
                strokeWidth={BAND_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke={wire.color}
                className="transition-opacity"
                opacity={isHovered ? 0.5 : 0.22}
              />
              <text
                fill={wire.color}
                className="font-mono font-bold transition-opacity"
                fontSize={GLYPH_SIZE}
                letterSpacing={GLYPH_SPACING}
                dominantBaseline="central"
                opacity={isHovered ? 1 : 0.65}
              >
                <textPath href={`#${pathId}`}>
                  {wire.glyphs}
                  {isMoving && (
                    <animate attributeName="startOffset" from="0" to={GLYPH_STEP} dur="0.5s" repeatCount="indefinite" />
                  )}
                </textPath>
              </text>
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
    </>
  )
}

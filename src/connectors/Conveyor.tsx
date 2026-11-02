import { roundedPath, routeLength, type Point } from './connectionRouting'

/** Conveyor band width, a bit under the 16px grid gap. */
export const CONVEYOR_WIDTH = 12
// One `>` every 12px: a 10px JetBrains Mono glyph is 6px wide, plus 6px of
// letter spacing. Scrolling by exactly one step makes the loop seamless.
const GLYPH_SIZE = 10
const GLYPH_SPACING = 6
const GLYPH_STEP = GLYPH_SIZE * 0.6 + GLYPH_SPACING

interface ConveyorProps {
  /** Unique in the document: the chevrons follow the band through it. */
  id: string
  points: readonly Point[]
  color: string
  highlighted?: boolean
  moving?: boolean
}

/** One conveyor: a translucent band along `points` with `>` chevrons pointing
 * from the first point to the last. Rendered inside an `<svg>`. Shared by the
 * dashboard wires and the settings banner so both always look the same. */
export function Conveyor({ id, points, color, highlighted = false, moving = false }: ConveyorProps) {
  const pathId = id.replace(/[^\w-]/g, '-')
  return (
    <>
      <path
        id={pathId}
        d={roundedPath(points)}
        fill="none"
        strokeWidth={CONVEYOR_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke={color}
        className="transition-opacity"
        opacity={highlighted ? 0.5 : 0.22}
      />
      <text
        fill={color}
        className="font-mono font-bold transition-opacity"
        fontSize={GLYPH_SIZE}
        letterSpacing={GLYPH_SPACING}
        dominantBaseline="central"
        opacity={highlighted ? 1 : 0.65}
      >
        <textPath href={`#${pathId}`}>
          {'>'.repeat(Math.ceil(routeLength(points) / GLYPH_STEP))}
          {moving && (
            <animate attributeName="startOffset" from="0" to={GLYPH_STEP} dur="0.5s" repeatCount="indefinite" />
          )}
        </textPath>
      </text>
    </>
  )
}

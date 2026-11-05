import { useId } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { readableTextColor } from '@/flow/linkGraph'
import { Conveyor } from '@/flow/Conveyor'
import { useFlowSettings } from '@/flow/useFlowSettings'
import { ExperimentalBadge } from './ExperimentalBadge'

// Two mini widgets in a 264 × 84 drawing: a source on the left whose header
// OUT tab feeds the IN tab of a target lower on the right.
const SOURCE = { x: 8, y: 8, w: 84, h: 56 }
const TARGET = { x: 172, y: 22, w: 84, h: 56 }
const HEADER_MID = 10
const SAMPLE = 'aGVsbG8='

/** Introduces flow at the top of their settings section: two mini
 * widgets joined by a live conveyor, in the user's first conveyor color. */
export function FlowBanner() {
  const id = useId()
  const color = useFlowSettings((state) => state.colors[0])
  // A demo, so it always moves, unless the system asks for reduced motion.
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const outY = SOURCE.y + HEADER_MID
  const inY = TARGET.y + HEADER_MID
  const bendX = (SOURCE.x + SOURCE.w + TARGET.x) / 2
  const points = [
    { x: SOURCE.x + SOURCE.w, y: outY },
    { x: bendX, y: outY },
    { x: bendX, y: inY },
    { x: TARGET.x, y: inY },
  ]

  return (
    // Glass: a blurred glow in the conveyor color and a neutral gray one
    // behind a translucent, frosted pane, so the blur has something to soften.
    <div className="relative isolate overflow-hidden rounded-lg border border-border">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          style={{ backgroundColor: color }}
          className="absolute -top-10 -left-6 size-40 rounded-full opacity-40 blur-3xl"
        />
        <div className="absolute -right-8 -bottom-12 size-44 rounded-full bg-muted-foreground opacity-20 blur-3xl" />
      </div>
      <div className="flex flex-col items-center gap-3 bg-background/50 p-3 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5)] backdrop-blur-xl sm:flex-row dark:bg-background/40 dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08)]">
        <svg
          viewBox="0 0 264 84"
          role="img"
          aria-label="A Base64 widget's output flowing into a Hash Generator's input"
          className="h-[84px] w-[264px] shrink-0"
        >
          <Conveyor id={`${id}-banner`} points={points} color={color} highlighted moving={!reduceMotion} />
          <MiniWidget {...SOURCE} title="Base64" />
          <MiniWidget {...TARGET} title="Hash Generator" />
          <Tab x={SOURCE.x + SOURCE.w} y={outY} label="OUT" color={color} />
          <Tab x={TARGET.x} y={inY} label="IN" color={color} />
        </svg>
        <div className="flex flex-col gap-1">
          <ExperimentalBadge className="self-start" />
          <p className="text-sm font-medium text-foreground">Use one widget's result in another</p>
          <p className="text-xs text-muted-foreground">
            Drag a widget's OUT tab onto another widget. Here, the text encoded by Base64 goes straight into the Hash
            Generator, which updates as you type.
          </p>
        </div>
      </div>
    </div>
  )
}

function MiniWidget({ x, y, w, h, title }: { x: number; y: number; w: number; h: number; title: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} className="fill-card/80 stroke-border" />
      <line x1={x} x2={x + w} y1={y + HEADER_MID * 2} y2={y + HEADER_MID * 2} className="stroke-border" />
      <text x={x + 10} y={y + HEADER_MID} dominantBaseline="central" fontSize={8} className="fill-foreground">
        {title}
      </text>
      <text
        x={x + 10}
        y={y + HEADER_MID * 2 + 16}
        dominantBaseline="central"
        fontSize={8}
        className="fill-muted-foreground font-mono"
      >
        {SAMPLE}
      </text>
    </g>
  )
}

/** Header tab centered on the widget's border, like `FlowPort`. */
function Tab({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  const width = label.length * 4.5 + 6
  return (
    <g>
      <rect x={x - width / 2} y={y - 5.5} width={width} height={11} rx={5.5} fill={color} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={6.5}
        fill={readableTextColor(color)}
        className="font-mono font-bold"
      >
        {label}
      </text>
    </g>
  )
}

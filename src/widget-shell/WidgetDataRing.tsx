import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'
import { useWidgetDataSettings } from '@/widgets/useWidgetDataSettings'

const CYCLE_MS = 1000
const ARCS = 4
const RADIUS = 11
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const SEGMENT = CIRCUMFERENCE / ARCS
const ARC = SEGMENT * 0.6
// Rotates each arc so the gaps sit evenly between them, starting at the top.
const GAP_DEG = ((SEGMENT - ARC) / SEGMENT) * (360 / ARCS)

interface WidgetDataRingProps extends SVGProps<SVGSVGElement> {
  /** `play` runs the chase once (see `ring-play` in index.css), `loop`
   * forever. Otherwise the ring is still, fully lit. */
  motion?: 'play' | 'loop'
}

/** Drawn under the widget data icon: four fixed emerald arcs that light up
 * one after another, so the ring seems to turn. Still when turned off in
 * Settings or under reduced motion. */
export function WidgetDataRing({ motion, className, ...props }: WidgetDataRingProps) {
  const animation = useWidgetDataSettings((state) => state.animation)
  const animate = animation && motion
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} aria-hidden="true" className={className} {...props}>
      {Array.from({ length: ARCS }, (_, index) => (
        <circle
          key={index}
          cx={12}
          cy={12}
          r={RADIUS}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
          transform={`rotate(${index * (360 / ARCS) - 90 + GAP_DEG / 2} 12 12)`}
          // Negative, so the chase is under way from the first frame. A play
          // then ends on each arc lighting up, one quarter after the other,
          // and the arc stays lit: the last turn closes the ring.
          style={animate ? { animationDelay: `${(index * CYCLE_MS) / ARCS - CYCLE_MS}ms` } : undefined}
          className={cn(
            'stroke-emerald-500 opacity-65',
            animate === 'play' && 'motion-safe:animate-ring-play',
            animate === 'loop' && 'motion-safe:animate-ring-chase',
          )}
        />
      ))}
    </svg>
  )
}

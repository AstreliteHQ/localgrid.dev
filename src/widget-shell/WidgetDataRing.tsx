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

/** Same offset for every arc of one ring, a different one per seed, so a
 * dashboard's widgets don't blink in sync. */
function seedOffset(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % CYCLE_MS
}

interface WidgetDataRingProps extends SVGProps<SVGSVGElement> {
  /** Sets where in the cycle the ring starts. */
  seed?: string
}

/** Drawn under the widget data icon: four fixed emerald arcs that light up
 * one after another, so the ring seems to turn. Still when turned off in
 * Settings or under reduced motion. */
export function WidgetDataRing({ seed = '', className, ...props }: WidgetDataRingProps) {
  const animation = useWidgetDataSettings((state) => state.animation)
  const offset = seedOffset(seed)
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} aria-hidden="true" className={className} {...props}>
      <circle cx={12} cy={12} r={RADIUS} stroke="currentColor" className="opacity-15" />
      {Array.from({ length: ARCS }, (_, index) => (
        <circle
          key={index}
          cx={12}
          cy={12}
          r={RADIUS}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
          transform={`rotate(${index * (360 / ARCS) - 90 + GAP_DEG / 2} 12 12)`}
          // Negative, so every arc is mid-cycle from the first frame.
          style={{ animationDelay: `${(((index * CYCLE_MS) / ARCS + offset) % CYCLE_MS) - CYCLE_MS}ms` }}
          className={cn('stroke-emerald-500 opacity-40', animation && 'motion-safe:animate-ring-chase')}
        />
      ))}
    </svg>
  )
}

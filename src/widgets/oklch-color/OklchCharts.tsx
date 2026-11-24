import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { formatOklch, type Oklch } from './oklch'
import { CHANNEL_NAMES, PLANES, colorAt, positionOf, renderPlane, type PlaneSpec } from './oklchPlanes'

/** Rendering every pixel at full device resolution takes a few tens of
 * milliseconds per chart. While a value is still moving the charts are
 * drawn at CSS resolution, then redrawn sharp once it settles. */
const SHARP_DELAY_MS = 150

const KEY_STEP = 0.01
const KEY_STEP_LARGE = 0.1

/** Draws on a Display P3 canvas where both the browser and the screen can
 * show it, so colors between sRGB and P3 appear as they are. */
function getContext(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; space: 'srgb' | 'display-p3' } | null {
  const wideScreen = typeof window.matchMedia === 'function' && window.matchMedia('(color-gamut: p3)').matches
  try {
    if (wideScreen) {
      const ctx = canvas.getContext('2d', { colorSpace: 'display-p3' })
      if (ctx && ctx.getContextAttributes?.().colorSpace === 'display-p3') return { ctx, space: 'display-p3' }
    }
    const ctx = canvas.getContext('2d')
    return ctx ? { ctx, space: 'srgb' } : null
  } catch {
    // jsdom, or a browser without canvas: the chart stays empty but usable.
    return null
  }
}

function formatFixed(plane: PlaneSpec, color: Oklch): string {
  const value = color[plane.fixed]
  if (plane.fixed === 'l') return `${Number((value * 100).toFixed(1))}%`
  if (plane.fixed === 'c') return String(Number(value.toFixed(3)))
  return `${Number(value.toFixed(1))}°`
}

interface OklchChartsProps {
  color: Oklch
  onChange: (next: Oklch) => void
  className?: string
}

/** The three oklch.com-style charts, stacked: each holds one channel at
 * the current value and lays the other two out as x and y. */
export function OklchCharts({ color, onChange, className }: OklchChartsProps) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {PLANES.map((plane) => (
        <OklchChart key={plane.fixed} plane={plane} color={color} onChange={onChange} />
      ))}
    </div>
  )
}

function OklchChart({ plane, color, onChange }: { plane: PlaneSpec; color: Oklch; onChange: (next: Oklch) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const dragging = useRef(false)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // Only the fixed channel changes the picture: the other two are its axes.
  const fixedValue = color[plane.fixed]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return
    const base = { l: 0, c: 0, h: 0, alpha: 1, [plane.fixed]: fixedValue }

    const draw = (scale: number) => {
      const width = Math.max(1, Math.round(size.width * scale))
      const height = Math.max(1, Math.round(size.height * scale))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const context = getContext(canvas)
      if (!context) return
      const { pixels } = renderPlane(plane, base, width, height, context.space)
      context.ctx.putImageData(new ImageData(pixels, width, height, { colorSpace: context.space }), 0, 0)
    }

    const frame = requestAnimationFrame(() => draw(1))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const sharp = dpr > 1 ? setTimeout(() => draw(dpr), SHARP_DELAY_MS) : undefined
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(sharp)
    }
  }, [plane, fixedValue, size])

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = 1 - (event.clientY - rect.top) / rect.height
    onChange(colorAt(plane, color, x, y))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const { x, y } = positionOf(plane, color)
    onChange(colorAt(plane, color, x + move[0], y + move[1]))
  }

  const position = positionOf(plane, color)
  const xName = CHANNEL_NAMES[plane.x]
  const yName = CHANNEL_NAMES[plane.y]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
        <span>
          <span className="text-foreground">{CHANNEL_NAMES[plane.fixed]}</span> {formatFixed(plane, color)}
        </span>
        <span className="truncate text-[10px]">
          {yName} by {xName.toLowerCase()}
        </span>
      </div>
      <div
        ref={boxRef}
        role="group"
        tabIndex={0}
        aria-label={`${CHANNEL_NAMES[plane.fixed]} chart: ${xName.toLowerCase()} across, ${yName.toLowerCase()} up. Arrow keys move the color.`}
        data-testid={`oklch-chart-${plane.fixed}`}
        className="relative min-h-10 flex-1 cursor-crosshair touch-none overflow-hidden rounded border border-input bg-muted/50 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onPointerDown={(event) => {
          dragging.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          pick(event)
        }}
        onPointerMove={(event) => {
          if (dragging.current) pick(event)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
        onKeyDown={handleKeyDown}
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50"
          style={{ left: `${position.x * 100}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 h-px bg-foreground/50"
          style={{ bottom: `${position.y * 100}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--foreground)]"
          style={{
            left: `${position.x * 100}%`,
            bottom: `${position.y * 100}%`,
            backgroundColor: formatOklch({ ...color, alpha: 1 }),
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

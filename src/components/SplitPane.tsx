import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Columns2, Rows2 } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'

/** `rows` stacks the panes (first on top, horizontal divider); `columns`
 * puts them side by side (first on the left, vertical divider). */
export type SplitDirection = 'rows' | 'columns'

const MIN_RATIO = 0.15
const MAX_RATIO = 0.85
const KEYBOARD_STEP = 0.05

const clampRatio = (ratio: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))

interface SplitPaneProps {
  direction: SplitDirection
  /** Share of the space given to `first`, between 0 and 1. */
  ratio: number
  onRatioChange: (ratio: number) => void
  first: ReactNode
  /** When absent, `first` takes the whole space and no divider is shown. */
  second?: ReactNode
  /** Accessible name for the divider. */
  label?: string
  className?: string
}

/** Two panes with a draggable divider between them. The divider is also
 * keyboard operable (arrow keys nudge the split, Home/End jump to the
 * limits, Enter resets to an even split) and a double click resets it. */
export function SplitPane({
  direction,
  ratio,
  onRatioChange,
  first,
  second,
  label = 'Resize panes',
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isRows = direction === 'rows'
  const hasSecond = second !== undefined && second !== null && second !== false
  const safeRatio = clampRatio(ratio)

  const ratioFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const size = isRows ? rect.height : rect.width
    if (size <= 0) return null
    const offset = isRows ? event.clientY - rect.top : event.clientX - rect.left
    return clampRatio(offset / size)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next = ratioFromPointer(event)
    if (next !== null) onRatioChange(next)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrease = isRows ? 'ArrowUp' : 'ArrowLeft'
    const increase = isRows ? 'ArrowDown' : 'ArrowRight'
    let next: number | null = null
    if (event.key === decrease) next = safeRatio - KEYBOARD_STEP
    else if (event.key === increase) next = safeRatio + KEYBOARD_STEP
    else if (event.key === 'Home') next = MIN_RATIO
    else if (event.key === 'End') next = MAX_RATIO
    else if (event.key === 'Enter') next = 0.5
    if (next === null) return
    event.preventDefault()
    onRatioChange(clampRatio(next))
  }

  return (
    <div ref={containerRef} className={cn('flex min-h-0 min-w-0', isRows ? 'flex-col' : 'flex-row', className)}>
      <div
        className="flex min-h-0 min-w-0 flex-col"
        style={{ flexGrow: hasSecond ? safeRatio : 1, flexShrink: 1, flexBasis: 0 }}
      >
        {first}
      </div>
      {hasSecond && (
        <>
          <div
            role="separator"
            tabIndex={0}
            aria-label={label}
            aria-orientation={isRows ? 'horizontal' : 'vertical'}
            aria-valuemin={MIN_RATIO * 100}
            aria-valuemax={MAX_RATIO * 100}
            aria-valuenow={Math.round(safeRatio * 100)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={() => onRatioChange(0.5)}
            onKeyDown={handleKeyDown}
            className={cn(
              'group flex shrink-0 touch-none items-center justify-center rounded outline-none select-none',
              'focus-visible:ring-1 focus-visible:ring-ring/50',
              isRows ? 'h-2 w-full cursor-row-resize' : 'h-full w-2 cursor-col-resize',
            )}
          >
            <div
              className={cn(
                'rounded-full bg-border transition-colors group-hover:bg-muted-foreground group-focus-visible:bg-muted-foreground group-active:bg-muted-foreground',
                isRows ? 'h-0.5 w-8' : 'h-8 w-0.5',
              )}
            />
          </div>
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={{ flexGrow: 1 - safeRatio, flexShrink: 1, flexBasis: 0 }}
          >
            {second}
          </div>
        </>
      )}
    </div>
  )
}

interface SplitDirectionToggleProps {
  value: SplitDirection
  onChange: (value: SplitDirection) => void
  className?: string
}

/** Icon-only switch between stacked and side-by-side panes, paired with
 * SplitPane. */
export function SplitDirectionToggle({ value, onChange, className }: SplitDirectionToggleProps) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      className={className}
      options={[
        { label: <Rows2 className="size-3.5" />, value: 'rows', ariaLabel: 'Stack panes' },
        { label: <Columns2 className="size-3.5" />, value: 'columns', ariaLabel: 'Panes side by side' },
      ]}
    />
  )
}

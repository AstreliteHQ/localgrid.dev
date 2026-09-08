import { useState, type DragEvent, type MouseEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateTimeInZone, formatTimeInZone } from './timeZones'
import {
  axisTicks,
  laneColor,
  laneColorName,
  positionRatio,
  type TimelineBounds,
  type TimelineEvent,
  type TimelineLane,
} from './timelineModel'

/** Horizontal padding, in pixels, kept clear at both ends of every track so a
 * marker sitting exactly on the first or last instant is still fully drawn
 * inside the rail instead of half-clipped by it. Shared by the markers, the
 * guides and the axis so all three agree on where "now" is. */
const TRACK_INSET = 8

/** CSS `left` for a 0..1 position, honoring the inset above. */
function offsetFor(ratio: number): string {
  return `calc(${TRACK_INSET}px + ${ratio} * (100% - ${TRACK_INSET * 2}px))`
}

/** Keeps a floating label inside the track: anchored left at the start,
 * right at the end, centered everywhere else. */
function anchorClass(ratio: number): string {
  if (ratio < 0.12) return 'translate-x-0'
  if (ratio > 0.88) return '-translate-x-full'
  return '-translate-x-1/2'
}

interface TimelineTracksProps {
  lanes: TimelineLane[]
  /** Already sorted by instant. */
  events: TimelineEvent[]
  bounds: TimelineBounds | null
  displayZone: string
  tickCount: number
  hoveredId: string | null
  selectedId: string | null
  /** Id of the event currently being dragged, which is what turns every
   * other lane into a visible drop target. */
  draggingId: string | null
  onHover: (eventId: string | null) => void
  onSelect: (eventId: string | null) => void
  onDragStart: (event: TimelineEvent) => (dragEvent: DragEvent) => void
  onDragEnd: () => void
  onDropOnLane: (laneId: string, dragEvent: DragEvent) => void
  onRenameLane: (laneId: string, name: string) => void
  onCycleLaneColor: (laneId: string) => void
  onRemoveLane: (laneId: string) => void
}

/** The lanes themselves: one rail per timeline, markers placed by instant,
 * a shared time guide, and the axis underneath. Split out of the widget
 * because the pointer work (hover linking, scrubbing, drop targets) is the
 * bulk of the interaction and none of it touches the widget's state plumbing
 * beyond the handlers above. */
export function TimelineTracks({
  lanes,
  events,
  bounds,
  displayZone,
  tickCount,
  hoveredId,
  selectedId,
  draggingId,
  onHover,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropOnLane,
  onRenameLane,
  onCycleLaneColor,
  onRemoveLane,
}: TimelineTracksProps) {
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null)
  // Cursor position along the rails, 0..1. Drives the roving guide that
  // answers "what time is this spot", which is the reason to mouse over a
  // track at all when no marker is under the pointer.
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)

  const hoveredEvent = events.find((event) => event.id === hoveredId) ?? null
  const guideRatio =
    bounds && hoveredEvent ? positionRatio(hoveredEvent.ms, bounds) : bounds && scrubRatio !== null ? scrubRatio : null
  const guideMs =
    bounds && hoveredEvent
      ? hoveredEvent.ms
      : bounds && scrubRatio !== null
        ? Math.round(bounds.startMs + bounds.spanMs * scrubRatio)
        : null
  const ticks = bounds ? axisTicks(bounds, tickCount, displayZone) : []
  const draggedFromLaneId = events.find((event) => event.id === draggingId)?.laneId ?? null

  const handleScrub = (mouseEvent: MouseEvent<HTMLDivElement>) => {
    if (!bounds) return
    const rect = mouseEvent.currentTarget.getBoundingClientRect()
    const usable = rect.width - TRACK_INSET * 2
    if (usable <= 0) return
    const ratio = (mouseEvent.clientX - rect.left - TRACK_INSET) / usable
    setScrubRatio(Math.min(1, Math.max(0, ratio)))
  }

  const acceptsDrag = (dragEvent: DragEvent) =>
    dragEvent.dataTransfer.types.includes('application/x-localgrid-timeline-event') ||
    dragEvent.dataTransfer.types.includes('text/plain')

  return (
    <div className="flex flex-col gap-1.5">
      {lanes.map((lane, laneIndex) => {
        const laneEvents = events.filter((event) => event.laneId === lane.id)
        const isDropTarget = dragOverLaneId === lane.id
        const isIdleTarget = draggingId !== null && draggedFromLaneId !== lane.id && !isDropTarget
        return (
          <div
            key={lane.id}
            role="group"
            aria-label={lane.name}
            onDragOver={(dragEvent) => {
              if (!acceptsDrag(dragEvent)) return
              dragEvent.preventDefault()
              dragEvent.dataTransfer.dropEffect = 'move'
              setDragOverLaneId(lane.id)
            }}
            onDragLeave={() => setDragOverLaneId((current) => (current === lane.id ? null : current))}
            onDrop={(dragEvent) => {
              dragEvent.preventDefault()
              setDragOverLaneId(null)
              onDropOnLane(lane.id, dragEvent)
            }}
            className={cn(
              'rounded-lg border p-1.5 transition-colors',
              isDropTarget && 'border-ring bg-muted/70 ring-1 ring-ring/50',
              isIdleTarget && 'border-dashed border-ring/50',
              !isDropTarget && !isIdleTarget && 'border-border',
            )}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onCycleLaneColor(lane.id)}
                aria-label={`Change color of ${lane.name}, currently ${laneColorName(lane.colorIndex)}`}
                className="size-3 shrink-0 rounded-full transition-transform hover:scale-125 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                style={{ backgroundColor: laneColor(lane.colorIndex) }}
              />
              <input
                value={lane.name}
                onChange={(changeEvent) => onRenameLane(lane.id, changeEvent.target.value)}
                aria-label={`Name of timeline ${laneIndex + 1}`}
                className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 py-0.5 font-medium outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring/50"
              />
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {laneEvents.length} {laneEvents.length === 1 ? 'event' : 'events'}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${lane.name}`}
                disabled={lanes.length <= 1}
                onClick={() => onRemoveLane(lane.id)}
              >
                <X />
              </Button>
            </div>

            <div
              onMouseMove={handleScrub}
              onMouseLeave={() => setScrubRatio(null)}
              className="relative mt-1 h-8 rounded-md bg-muted/40"
            >
              <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border" />

              {guideRatio !== null && (
                <div
                  aria-hidden
                  className={cn('absolute inset-y-0 w-px', hoveredEvent ? 'bg-foreground/40' : 'bg-foreground/15')}
                  style={{ left: offsetFor(guideRatio) }}
                />
              )}

              {laneEvents.length === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                  {draggingId !== null ? 'Drop here' : events.length === 0 ? 'No events yet' : 'Drag events here'}
                </p>
              )}

              {bounds &&
                laneEvents.map((event) => {
                  const ratio = positionRatio(event.ms, bounds)
                  const isHovered = hoveredId === event.id
                  const isSelected = selectedId === event.id
                  const isDimmed = hoveredId !== null && !isHovered
                  return (
                    <button
                      key={event.id}
                      type="button"
                      draggable
                      onDragStart={onDragStart(event)}
                      onDragEnd={onDragEnd}
                      onMouseEnter={() => onHover(event.id)}
                      onMouseLeave={() => onHover(null)}
                      onFocus={() => onHover(event.id)}
                      onBlur={() => onHover(null)}
                      onClick={() => onSelect(isSelected ? null : event.id)}
                      aria-pressed={isSelected}
                      aria-label={`${event.label || 'Event'} at ${formatTimeInZone(event.ms, displayZone)} on ${lane.name}`}
                      // The 24px hit area around a 12px dot is what makes the
                      // markers grabbable with a mouse; the dot itself stays
                      // small so dense timelines stay readable.
                      className={cn(
                        'absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full focus-visible:outline-none active:cursor-grabbing',
                        (isHovered || isSelected) && 'z-10',
                      )}
                      style={{ left: offsetFor(ratio) }}
                    >
                      <span
                        className={cn(
                          'size-3 rounded-full border-2 border-card transition-all',
                          isHovered && 'scale-150',
                          isSelected && 'ring-2 ring-foreground ring-offset-1 ring-offset-card',
                          isDimmed && !isSelected && 'opacity-40',
                        )}
                        style={{ backgroundColor: laneColor(lane.colorIndex) }}
                      />
                      {(isHovered || isSelected) && (
                        <span
                          className={cn(
                            'pointer-events-none absolute bottom-full z-20 mb-1 max-w-40 truncate rounded border border-border bg-popover px-1 py-0.5 font-mono text-[10px] whitespace-nowrap text-popover-foreground shadow-sm',
                            anchorClass(ratio),
                          )}
                        >
                          {formatTimeInZone(event.ms, displayZone)}
                          {event.label ? ` ${event.label}` : ''}
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          </div>
        )
      })}

      {bounds && (
        <div className="relative h-4 font-mono text-[10px] text-muted-foreground">
          {ticks.map((tick) => (
            <span
              key={tick.ratio}
              className={cn(
                'absolute top-0 whitespace-nowrap transition-opacity',
                anchorClass(tick.ratio),
                // The live readout sits on this same line, so the fixed
                // ticks step back while it is showing.
                guideRatio !== null && 'opacity-40',
              )}
              style={{ left: offsetFor(tick.ratio) }}
            >
              {tick.label}
            </span>
          ))}
          {guideRatio !== null && guideMs !== null && (
            <span
              className={cn(
                'absolute top-0 rounded bg-foreground px-1 whitespace-nowrap text-background',
                anchorClass(guideRatio),
              )}
              style={{ left: offsetFor(guideRatio) }}
              title={formatDateTimeInZone(guideMs, displayZone)}
            >
              {formatTimeInZone(guideMs, displayZone)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

import { useId, useMemo, useState, type DragEvent } from 'react'
import { nanoid } from 'nanoid'
import { GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { SUPPORTED_FORMAT_EXAMPLES, parseEventLines } from './parseTimestamp'
import { TimelineTracks } from './TimelineTracks'
import {
  LOCAL_TIME_ZONE,
  formatDateTimeInZone,
  formatOffsetLabel,
  formatTimeInZone,
  getUtcOffsetMinutes,
  isValidTimeZone,
  listTimeZones,
} from './timeZones'
import {
  formatDelta,
  formatDuration,
  laneColor,
  nextColorIndex,
  sortEvents,
  spansMultipleDays,
  timelineBounds,
  timelineToText,
  type TimelineEvent,
  type TimelineLane,
} from './timelineModel'

const FIRST_LANE_ID = 'lane-1'

/** Drag payload key. `text/plain` is set alongside it so a marker dragged out
 * of the widget still carries something readable, and so log text dragged in
 * from an editor or a browser tab can be dropped straight onto a lane. */
const DRAG_MIME = 'application/x-localgrid-timeline-event'

function defaultLanes(): TimelineLane[] {
  return [{ id: FIRST_LANE_ID, name: 'Timeline 1', colorIndex: 0 }]
}

const SELECT_CLASS =
  'h-6 min-w-0 rounded-md border border-input bg-transparent px-1 text-[11px] outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30'

export default function TimelineBuilderWidget({ instanceId, mode }: WidgetProps) {
  const [lanes, setLanes] = useWidgetState<TimelineLane[]>(instanceId, 'lanes', defaultLanes)
  const [events, setEvents] = useWidgetState<TimelineEvent[]>(instanceId, 'events', [])
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  // Zone the pasted text is read in when it carries no offset of its own,
  // kept separate from the zone everything is displayed in: reading a
  // UTC-logged incident in local time is the entire job here.
  const [inputZone, setInputZone] = useWidgetState(instanceId, 'inputZone', LOCAL_TIME_ZONE)
  const [displayZone, setDisplayZone] = useWidgetState(instanceId, 'displayZone', LOCAL_TIME_ZONE)
  const [targetLaneId, setTargetLaneId] = useWidgetState(instanceId, 'targetLaneId', FIRST_LANE_ID)
  const [failedLines, setFailedLines] = useState<string[]>([])
  // Hover and selection are shared by the tracks and the list so pointing at
  // an event in one place lights it up in the other, which is what makes a
  // marker and its row read as the same thing.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Only used to date the "current offset" readout while the timeline is
  // still empty; captured once at mount rather than read during render,
  // which would make the render impure for a label nobody watches tick.
  const [mountedAt] = useState(() => Date.now())
  const inputFieldId = useId()

  useWidgetDirty(instanceId, events.length > 0 || input.trim() !== '' || lanes.length > 1)

  const timeZones = useMemo(() => listTimeZones(), [])
  const sorted = useMemo(() => sortEvents(events), [events])
  const bounds = useMemo(() => timelineBounds(sorted), [sorted])
  const multiDay = useMemo(() => spansMultipleDays(sorted, displayZone), [sorted, displayZone])

  const laneById = useMemo(() => new Map(lanes.map((lane) => [lane.id, lane])), [lanes])
  const colorForEvent = (event: TimelineEvent) => laneColor(laneById.get(event.laneId)?.colorIndex ?? 0)
  const activeLaneId = laneById.has(targetLaneId) ? targetLaneId : (lanes[0]?.id ?? FIRST_LANE_ID)
  const selectedEvent = sorted.find((event) => event.id === selectedId) ?? null

  const displayOffset = formatOffsetLabel(getUtcOffsetMinutes(bounds?.startMs ?? mountedAt, displayZone))

  const addEvents = (text: string, laneId: string) => {
    const { events: parsed, failed } = parseEventLines(text, { timeZone: inputZone })
    if (parsed.length > 0) {
      setEvents((previous) => [
        ...previous,
        ...parsed.map((event) => ({
          id: nanoid(8),
          ms: event.ms,
          label: event.label,
          laneId,
          format: event.format,
          hasExplicitOffset: event.hasExplicitOffset,
          readZone: inputZone,
          source: event.source,
        })),
      ])
    }
    return failed
  }

  const handleAdd = () => {
    const failed = addEvents(input, activeLaneId)
    setFailedLines(failed)
    // Anything unparseable stays in the box so it can be corrected in place
    // rather than being silently dropped on the floor.
    setInput(failed.join('\n'))
  }

  const handleAddNow = () => {
    const now = Date.now()
    setEvents((previous) => [
      ...previous,
      {
        id: nanoid(8),
        ms: now,
        label: input.trim() || 'now',
        laneId: activeLaneId,
        format: 'Captured now',
        hasExplicitOffset: true,
        readZone: inputZone,
        source: formatDateTimeInZone(now, displayZone),
      },
    ])
    setInput('')
    setFailedLines([])
  }

  const moveEvent = (eventId: string, laneId: string) => {
    setEvents((previous) => previous.map((event) => (event.id === eventId ? { ...event, laneId } : event)))
  }

  const relabelEvent = (eventId: string, label: string) => {
    setEvents((previous) => previous.map((event) => (event.id === eventId ? { ...event, label } : event)))
  }

  const removeEvent = (eventId: string) => {
    setEvents((previous) => previous.filter((event) => event.id !== eventId))
    setSelectedId((current) => (current === eventId ? null : current))
  }

  const addLane = () => {
    const lane: TimelineLane = {
      id: nanoid(8),
      name: `Timeline ${lanes.length + 1}`,
      colorIndex: nextColorIndex(lanes),
    }
    setLanes((previous) => [...previous, lane])
    setTargetLaneId(lane.id)
  }

  const renameLane = (laneId: string, name: string) => {
    setLanes((previous) => previous.map((lane) => (lane.id === laneId ? { ...lane, name } : lane)))
  }

  const cycleLaneColor = (laneId: string) => {
    setLanes((previous) =>
      previous.map((lane) => (lane.id === laneId ? { ...lane, colorIndex: lane.colorIndex + 1 } : lane)),
    )
  }

  const removeLane = (laneId: string) => {
    if (lanes.length <= 1) return
    const fallbackId = lanes.find((lane) => lane.id !== laneId)?.id ?? FIRST_LANE_ID
    // Events outlive their lane: losing timestamps because a lane was tidied
    // away would be the one unrecoverable action in the widget.
    setEvents((previous) =>
      previous.map((event) => (event.laneId === laneId ? { ...event, laneId: fallbackId } : event)),
    )
    setLanes((previous) => previous.filter((lane) => lane.id !== laneId))
    if (targetLaneId === laneId) setTargetLaneId(fallbackId)
  }

  const clearEvents = () => {
    setEvents([])
    setFailedLines([])
    setSelectedId(null)
  }

  const startDrag = (event: TimelineEvent) => (dragEvent: DragEvent) => {
    dragEvent.dataTransfer.setData(DRAG_MIME, event.id)
    dragEvent.dataTransfer.setData('text/plain', `${formatDateTimeInZone(event.ms, displayZone)} ${event.label}`)
    dragEvent.dataTransfer.effectAllowed = 'move'
    setDraggingId(event.id)
  }

  /** A drop is either one of our own markers changing lane, or text from
   * outside (a selected log line, a spreadsheet cell) landing on a lane, in
   * which case it is parsed straight into that lane. */
  const handleDropOnLane = (laneId: string, dragEvent: DragEvent) => {
    setDraggingId(null)
    const eventId = dragEvent.dataTransfer.getData(DRAG_MIME)
    if (eventId) {
      moveEvent(eventId, laneId)
      return
    }
    const text = dragEvent.dataTransfer.getData('text/plain')
    if (!text.trim()) return
    setFailedLines(addEvents(text, laneId))
  }

  const eventTime = (event: TimelineEvent) =>
    multiDay ? formatDateTimeInZone(event.ms, displayZone) : formatTimeInZone(event.ms, displayZone)

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-start gap-1">
        <Textarea
          id={inputFieldId}
          aria-label="Timestamps to add"
          value={input}
          onChange={(changeEvent) => setInput(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Enter' && (keyEvent.metaKey || keyEvent.ctrlKey)) {
              keyEvent.preventDefault()
              handleAdd()
            }
          }}
          rows={2}
          spellCheck={false}
          placeholder={
            '2024-01-15T12:34:56Z deploy started\n1705322096789 | cache warm\nJan 15 12:35:01 healthcheck ok'
          }
          className="min-h-14 flex-1 font-mono text-xs"
        />
        <div className="flex flex-col gap-1">
          <Button type="button" size="sm" onClick={handleAdd} disabled={input.trim() === ''}>
            Add
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleAddNow}>
            Now
          </Button>
        </div>
      </div>

      {failedLines.length > 0 && (
        <ErrorMessage>
          {failedLines.length === 1 ? 'No timestamp found in: ' : `No timestamp found in ${failedLines.length} lines: `}
          {failedLines.slice(0, 2).join(', ')}
        </ErrorMessage>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1">
          Add to
          <select
            aria-label="Timeline new events go to"
            value={activeLaneId}
            onChange={(changeEvent) => setTargetLaneId(changeEvent.target.value)}
            className={cn(SELECT_CLASS, 'max-w-28')}
          >
            {lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Read as
          <select
            aria-label="Input time zone"
            value={isValidTimeZone(inputZone) ? inputZone : 'UTC'}
            onChange={(changeEvent) => setInputZone(changeEvent.target.value)}
            className={cn(SELECT_CLASS, 'max-w-32')}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Show in
          <select
            aria-label="Display time zone"
            value={isValidTimeZone(displayZone) ? displayZone : 'UTC'}
            onChange={(changeEvent) => setDisplayZone(changeEvent.target.value)}
            className={cn(SELECT_CLASS, 'max-w-32')}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono">{displayOffset}</span>
        <Button type="button" size="xs" variant="ghost" onClick={addLane}>
          <Plus />
          Timeline
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton
            value={timelineToText(events, lanes, displayZone)}
            label=""
            ariaLabel="Copy timeline as text"
            className="size-6"
          />
          <Button type="button" size="xs" variant="ghost" onClick={clearEvents} disabled={events.length === 0}>
            Clear
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <TimelineTracks
          lanes={lanes}
          events={sorted}
          bounds={bounds}
          displayZone={displayZone}
          tickCount={mode === 'overlay' ? 5 : 3}
          hoveredId={hoveredId}
          selectedId={selectedId}
          draggingId={draggingId}
          onHover={setHoveredId}
          onSelect={setSelectedId}
          onDragStart={startDrag}
          onDragEnd={() => setDraggingId(null)}
          onDropOnLane={handleDropOnLane}
          onRenameLane={renameLane}
          onCycleLaneColor={cycleLaneColor}
          onRemoveLane={removeLane}
        />

        {bounds ? (
          <p className="text-[11px] text-muted-foreground">
            {events.length} {events.length === 1 ? 'event' : 'events'} over{' '}
            <span className="font-mono text-foreground">{formatDuration(bounds.spanMs)}</span>, from{' '}
            <span className="font-mono">{formatDateTimeInZone(bounds.startMs, displayZone)}</span> in {displayZone}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Paste timestamps above, one per line, with an optional label. Drop log text straight onto a timeline, and
            drag events between timelines to group them.
          </p>
        )}

        {selectedEvent && (
          <p className="truncate rounded-md bg-muted/60 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
            <span className="text-foreground">{formatDateTimeInZone(selectedEvent.ms, displayZone)}</span> ·{' '}
            {selectedEvent.format}
            {selectedEvent.hasExplicitOffset ? '' : `, read as ${selectedEvent.readZone}`} · {selectedEvent.source}
          </p>
        )}

        {sorted.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {sorted.map((event, index) => {
              const isHovered = hoveredId === event.id
              const isSelected = selectedId === event.id
              return (
                <li
                  key={event.id}
                  onMouseEnter={() => setHoveredId(event.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    'flex items-center gap-1 rounded px-0.5 py-0.5 transition-colors',
                    isHovered && 'bg-muted',
                    isSelected && 'bg-muted ring-1 ring-ring/40',
                  )}
                >
                  <span
                    draggable
                    onDragStart={startDrag(event)}
                    onDragEnd={() => setDraggingId(null)}
                    title="Drag onto another timeline"
                    aria-hidden
                    className="shrink-0 cursor-grab text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="size-3" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : event.id)}
                    onFocus={() => setHoveredId(event.id)}
                    onBlur={() => setHoveredId(null)}
                    aria-pressed={isSelected}
                    aria-label={`Show details for event at ${eventTime(event)}`}
                    className="flex shrink-0 items-center gap-1 rounded-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span
                      className={cn('size-2 rounded-full transition-transform', isHovered && 'scale-125')}
                      style={{ backgroundColor: colorForEvent(event) }}
                    />
                    <span className="font-mono text-[11px] tabular-nums">{eventTime(event)}</span>
                  </button>
                  <span className="w-16 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                    {index === 0 ? '' : formatDelta(event.ms - sorted[index - 1].ms)}
                  </span>
                  <input
                    value={event.label}
                    onChange={(changeEvent) => relabelEvent(event.id, changeEvent.target.value)}
                    aria-label={`Label for event at ${eventTime(event)}`}
                    placeholder="label"
                    className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground/70 hover:bg-background focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/50"
                  />
                  <select
                    value={event.laneId}
                    onChange={(changeEvent) => moveEvent(event.id, changeEvent.target.value)}
                    aria-label={`Timeline for event at ${eventTime(event)}`}
                    className={cn(SELECT_CLASS, 'max-w-24 shrink-0')}
                  >
                    {lanes.map((lane) => (
                      <option key={lane.id} value={lane.id}>
                        {lane.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove event at ${eventTime(event)}`}
                    onClick={() => removeEvent(event.id)}
                  >
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <details className="mt-auto text-[10px] text-muted-foreground">
          <summary className="cursor-pointer select-none">Supported formats</summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-3 font-mono">
            {SUPPORTED_FORMAT_EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}

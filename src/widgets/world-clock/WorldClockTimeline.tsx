import { Home, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { City } from './cities'
import { buildTimelineRow, referenceFraction, type HourBand } from './timeline'
import { formatOffsetLabel, formatZonedTime, getUtcOffsetMinutes } from './timeZoneMath'

/** Hours shown before the reference hour, then the rest of a full day
 * after it: a little look-back for context while keeping the reference
 * hour near the left edge, visible without scrolling. */
export const TIMELINE_HOURS_BEFORE = 2
export const TIMELINE_HOURS = 24

// The theme's primary is monochrome, so the warm `highlight` token carries
// "daytime" here. Night uses the same fixed dark tint as the map's night
// side so it reads as night in both light and dark mode.
// Width of the sticky city column (`w-36`) plus the row gap (`gap-1`), so
// the reference-hour frame below can line up with the hour strips.
const LABEL_COLUMN = '9.25rem'

const BAND_CLASSES: Record<HourBand, string> = {
  work: 'bg-highlight/70 text-foreground',
  edge: 'bg-highlight/25 text-foreground',
  night: 'bg-[rgb(2_6_23/0.32)] text-muted-foreground',
}

const cellTitleFormatters = new Map<string, Intl.DateTimeFormat>()

function formatCellTitle(ms: number, timeZone: string): string {
  let formatter = cellTitleFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    cellTitleFormatters.set(timeZone, formatter)
  }
  return formatter.format(ms)
}

interface WorldClockTimelineProps {
  date: Date
  cities: City[]
  homeCityId?: string | null
  onRemove: (id: string) => void
  /** Called with a whole-hour offset from the reference hour when a column
   * is clicked, so picking a slot moves the reference time there. */
  onShiftHours: (deltaHours: number) => void
}

/** One line per city, hours running left to right from the reference time,
 * every row sharing the same instants so a column reads as "this moment
 * everywhere". Cells are shaded by office hours / evening / night to make a
 * good meeting slot easy to spot. */
export function WorldClockTimeline({ date, cities, homeCityId, onRemove, onShiftHours }: WorldClockTimelineProps) {
  const markerLeft = `${((TIMELINE_HOURS_BEFORE + referenceFraction(date)) / TIMELINE_HOURS) * 100}%`

  return (
    <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Timeline of local hours per city">
      <div className="relative flex min-w-max flex-col gap-1">
        {cities.map((city) => {
          const cells = buildTimelineRow(date, city.tz, TIMELINE_HOURS_BEFORE, TIMELINE_HOURS)
          const isHome = city.id === homeCityId
          return (
            <div key={city.id} className="flex items-stretch gap-1">
              {/* The before/after strips paint over the row gaps next to and
                  below the label, so the reference-hour frame never peeks
                  through them when the hours are scrolled underneath. */}
              <div className="sticky left-0 z-10 flex w-36 shrink-0 items-center justify-between gap-1 rounded-md bg-card px-2 py-1 before:absolute before:inset-y-0 before:left-full before:w-1 before:bg-card after:absolute after:inset-x-0 after:top-full after:h-1 after:bg-card">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-medium text-foreground">
                    <span className="truncate">{city.city}</span>
                    {isHome && (
                      <Home className="size-3 shrink-0 text-muted-foreground" aria-label="Your local time zone" />
                    )}
                  </div>
                  <div className="font-mono whitespace-nowrap text-foreground">{formatZonedTime(date, city.tz)}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {formatOffsetLabel(getUtcOffsetMinutes(date, city.tz))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(city.id)}
                  aria-label={`Remove ${city.city}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>

              <div className="relative flex flex-1 overflow-hidden rounded-md">
                {cells.map((cell) => {
                  const isReference = cell.offset === 0
                  const title = formatCellTitle(cell.startMs, city.tz)
                  return (
                    // Not in the tab order: 24 stops per city would bury the
                    // rest of the widget, and the ±1h buttons already cover
                    // moving the reference time from the keyboard.
                    <button
                      key={cell.offset}
                      type="button"
                      tabIndex={-1}
                      title={title}
                      aria-label={`${city.city}: ${title}`}
                      onClick={() => onShiftHours(cell.offset)}
                      className={cn(
                        'flex w-7 min-w-7 flex-1 flex-col items-center justify-center font-mono leading-tight transition-colors hover:bg-primary/40',
                        BAND_CLASSES[cell.band],
                        cell.dayLabel && cell.offset !== -TIMELINE_HOURS_BEFORE && 'border-l border-foreground/40',
                        isReference && 'font-semibold',
                      )}
                    >
                      <span className="h-3 text-[9px] font-sans text-muted-foreground">{cell.dayLabel}</span>
                      <span className="text-[11px]">
                        {cell.hour}
                        {cell.minute !== 0 && <sup className="text-[8px]">{String(cell.minute).padStart(2, '0')}</sup>}
                      </span>
                    </button>
                  )
                })}
                <span
                  className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary"
                  style={{ left: markerLeft }}
                  aria-hidden="true"
                />
              </div>
            </div>
          )
        })}
        {/* One frame around the whole reference hour, spanning every row,
            so the selected (or current) hour reads as a column rather than
            just the thin minute marker. Stays under the sticky city column
            when the strips are scrolled sideways. */}
        <span
          data-testid="timeline-reference-hour"
          className="pointer-events-none absolute inset-y-0 z-[5] rounded-sm border-2 border-primary"
          style={{
            left: `calc(${LABEL_COLUMN} + (100% - ${LABEL_COLUMN}) * ${TIMELINE_HOURS_BEFORE / TIMELINE_HOURS})`,
            width: `calc((100% - ${LABEL_COLUMN}) / ${TIMELINE_HOURS})`,
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

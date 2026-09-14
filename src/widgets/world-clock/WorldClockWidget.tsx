import { useEffect, useId, useMemo, useState } from 'react'
import { Home, Moon, Plus, Sun, X } from 'lucide-react'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { WORLD_CITIES, defaultCityIds, getCity, type City } from './cities'
import {
  dayOffsetLabel,
  formatOffsetLabel,
  formatZonedDateLabel,
  formatZonedTime,
  getUtcOffsetMinutes,
} from './timeZoneMath'
import { isNight } from './solarTerminator'
import { WorldClockMap } from './WorldClockMap'

const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const SORTED_CITIES = [...WORLD_CITIES].sort((a, b) => a.city.localeCompare(b.city))

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalDatetimeInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export default function WorldClockWidget({ instanceId }: WidgetProps) {
  const [selectedIds, setSelectedIds] = useWidgetState<string[]>(instanceId, 'selectedIds', () =>
    defaultCityIds(LOCAL_TIME_ZONE),
  )
  // Same "capture the mount-time default once" trick TimestampConverterWidget
  // uses for its epoch — there's no fixed constant to diff against here
  // either, since the default itself depends on the browser's time zone.
  const [initialSelectedIds] = useWidgetState<string[]>(instanceId, 'initialSelectedIds', selectedIds)
  const [referenceMode, setReferenceMode] = useWidgetState<'live' | 'custom'>(instanceId, 'referenceMode', 'live')
  // The field's own raw text (whatever's currently typed, including
  // transiently empty/invalid while mid-edit) — kept separate from the
  // *applied* instant below so a not-yet-valid edit never gets rendered as
  // if it were a committed custom time.
  const [customDateInput, setCustomDateInput] = useWidgetState(instanceId, 'customDateInput', () =>
    toLocalDatetimeInputValue(new Date()),
  )
  // The last successfully-parsed custom instant, in ms — null until the
  // visitor has actually entered one. Only this (never customDateInput
  // directly) feeds `date` below, so an empty/invalid draft simply leaves
  // the previously-applied time in place instead of falling back to a
  // `liveNow` that's gone stale the moment referenceMode left 'live'.
  const [customDateMs, setCustomDateMs] = useWidgetState<number | null>(instanceId, 'customDateMs', null)
  // The picker holds the actual City object, not just its id, so it can
  // feed the combobox's `value`/`itemToStringLabel` directly and drive
  // both display text and the search filter (by city name and country)
  // off the same object.
  const [addPick, setAddPick] = useState<City | null>(null)
  // Native `datetime-local` inputs only ever fire `input`/`change` with a
  // complete valid value or an empty string — never a partial one — so the
  // only "invalid" state in practice is empty, typically while the visitor
  // has cleared the field to type a full replacement. While focused, the
  // field always echoes back exactly what's typed (see the `value` prop
  // below); this is what makes that possible without a live tick fighting
  // the edit by forcing the field back to "now" mid-keystroke. Plain state
  // rather than a ref (contrast NumberField's `focused`) because it has to
  // feed the `value` prop itself, and a ref read during render can't
  // reliably trigger the re-render that value change needs.
  const [dateFieldFocused, setDateFieldFocused] = useState(false)

  useWidgetDirty(instanceId, !sameIds(selectedIds, initialSelectedIds) || referenceMode === 'custom')

  const [liveNow, setLiveNow] = useState(() => Date.now())
  useEffect(() => {
    if (referenceMode !== 'live') return
    const id = setInterval(() => setLiveNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [referenceMode])

  const date = useMemo(() => {
    if (referenceMode === 'live') return new Date(liveNow)
    return customDateMs !== null ? new Date(customDateMs) : new Date(liveNow)
  }, [referenceMode, liveNow, customDateMs])

  const cities = useMemo(() => selectedIds.map(getCity).filter((c): c is City => c !== undefined), [selectedIds])
  const localCity = useMemo(() => WORLD_CITIES.find((c) => c.tz === LOCAL_TIME_ZONE) ?? null, [])
  const availableToAdd = useMemo(() => SORTED_CITIES.filter((c) => !selectedIds.includes(c.id)), [selectedIds])
  // A pick that's no longer in `availableToAdd` (already added elsewhere,
  // e.g. from another tab sharing this instance's state) shouldn't linger
  // as a stale selection — computed inline rather than synced back with an
  // effect, the same derive-during-render approach the old plain `<select>`
  // used for its own `addValue`.
  const addValue = addPick && availableToAdd.includes(addPick) ? addPick : null

  const handleAdd = () => {
    if (!addValue) return
    const id = addValue.id
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setAddPick(null)
  }

  const handleRemove = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const handleNow = () => {
    const now = new Date()
    setLiveNow(now.getTime())
    setCustomDateInput(toLocalDatetimeInputValue(now))
    setCustomDateMs(null)
    setReferenceMode('live')
  }

  const handleCustomChange = (value: string) => {
    setCustomDateInput(value)
    const parsed = new Date(value)
    // Only a fully-valid edit commits: an empty or unparseable draft (see
    // `dateFieldFocused` above) just sits there, still visible, without
    // touching `referenceMode` or the applied instant.
    if (!Number.isNaN(parsed.getTime())) {
      setCustomDateMs(parsed.getTime())
      setReferenceMode('custom')
    }
  }

  // Reached on blur with nothing valid ever entered this edit (still
  // empty, or an abandoned partial) — snaps the field back to whatever
  // instant is actually in effect instead of leaving it looking broken.
  const handleDateBlur = () => {
    setDateFieldFocused(false)
    if (Number.isNaN(new Date(customDateInput).getTime())) {
      setCustomDateInput(toLocalDatetimeInputValue(date))
    }
  }

  const handleShiftHours = (deltaHours: number) => {
    const shifted = new Date(date.getTime() + deltaHours * 60 * 60 * 1000)
    setCustomDateInput(toLocalDatetimeInputValue(shifted))
    setCustomDateMs(shifted.getTime())
    setReferenceMode('custom')
  }

  const dateFieldId = useId()
  const addFieldId = useId()

  return (
    <div className="@container flex h-full flex-col gap-2 text-xs">
      {/* `w-full` lets the map fill the widget at its true 2:1 ratio for
          any normal size, growing right along with the widget. `max-w-3xl`
          only ever engages once that full width would push the box past
          768px, which is where the map would otherwise get tall enough to
          crowd out the scrollable city list below; below that threshold
          it's a no-op and the map is genuinely full-size. `self-center`
          keeps it centered once the cap is in effect. */}
      <div className="hidden @xs:block aspect-[2/1] w-full max-w-3xl shrink-0 self-center overflow-hidden rounded-md bg-muted/20">
        <WorldClockMap date={date} cities={cities} homeCityId={localCity?.id} />
      </div>

      <div className="flex flex-wrap items-end gap-1.5">
        <Field label="Reference time" htmlFor={dateFieldId} className="min-w-0 flex-1">
          <Input
            id={dateFieldId}
            type="datetime-local"
            value={referenceMode === 'live' && !dateFieldFocused ? toLocalDatetimeInputValue(date) : customDateInput}
            onChange={(event) => handleCustomChange(event.target.value)}
            onFocus={() => setDateFieldFocused(true)}
            onBlur={handleDateBlur}
            className="w-full font-mono"
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleShiftHours(-1)}
          aria-label="Shift back 1 hour"
          className="h-8 shrink-0 px-2 font-mono"
        >
          −1h
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleShiftHours(1)}
          aria-label="Shift forward 1 hour"
          className="h-8 shrink-0 px-2 font-mono"
        >
          +1h
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleNow}
          disabled={referenceMode === 'live'}
          className="h-8 shrink-0"
        >
          Now
        </Button>
      </div>
      {referenceMode === 'live' ? (
        <span className="-mt-1 inline-flex items-center gap-1 self-start text-success">
          <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
          Live
        </span>
      ) : (
        <span className="-mt-1 self-start text-muted-foreground">Previewing a custom time</span>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {cities.length === 0 && (
          <p className="p-2 text-center text-muted-foreground">Add a city to see its local time</p>
        )}
        {cities.map((city) => (
          <CityRow
            key={city.id}
            city={city}
            date={date}
            isHome={city.id === localCity?.id}
            onRemove={() => handleRemove(city.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-1.5">
        <Field label="Add city" htmlFor={addFieldId} className="min-w-0 flex-1">
          {/* itemToStringLabel drives both the display text and the
              built-in search filter, so typing matches against city name
              and country together (e.g. "jap" finds Tokyo). */}
          <Combobox<City>
            items={availableToAdd}
            value={addValue}
            onValueChange={setAddPick}
            itemToStringLabel={(city) => `${city.city}, ${city.country}`}
            disabled={availableToAdd.length === 0}
          >
            <ComboboxInput
              id={addFieldId}
              placeholder={availableToAdd.length === 0 ? 'All cities added' : 'Search cities or countries…'}
            />
            <ComboboxPortal>
              <ComboboxPositioner>
                <ComboboxPopup>
                  <ComboboxEmpty>No matching cities</ComboboxEmpty>
                  <ComboboxList>
                    {(city: City) => (
                      <ComboboxItem key={city.id} value={city}>
                        {city.city}, {city.country}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxPopup>
              </ComboboxPositioner>
            </ComboboxPortal>
          </Combobox>
        </Field>
        <Button type="button" size="sm" onClick={handleAdd} disabled={!addValue} className="h-8 shrink-0">
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
    </div>
  )
}

function CityRow({ city, date, isHome, onRemove }: { city: City; date: Date; isHome: boolean; onRemove: () => void }) {
  const night = isNight(city.lat, city.lon, date)
  const offsetMinutes = getUtcOffsetMinutes(date, city.tz)
  const dayOffset = dayOffsetLabel(date, city.tz, LOCAL_TIME_ZONE)

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-background p-2 dark:bg-muted/40">
      <div className="flex min-w-0 items-center gap-2">
        {night ? (
          <Moon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Sun className="size-4 shrink-0 text-primary" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-medium text-foreground">
            <span className="truncate">{city.city}</span>
            {isHome && <Home className="size-3 shrink-0 text-muted-foreground" aria-label="Your local time zone" />}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">{formatZonedDateLabel(date, city.tz)}</span>
            {dayOffset && (
              <span className={cn('font-medium', dayOffset.startsWith('+') ? 'text-primary' : 'text-destructive')}>
                {dayOffset}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="text-right">
          <div className="font-mono text-sm font-semibold text-foreground">{formatZonedTime(date, city.tz)}</div>
          <div className="text-[11px] text-muted-foreground">{formatOffsetLabel(offsetMinutes)}</div>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${city.city}`}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useId, useMemo } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState, useWidgetStateStore } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  UTC_OFFSETS,
  closestOffsetMinutes,
  convertOffset,
  formatDateLabel,
  formatDayDiffLabel,
  formatOffsetLabel,
  formatTimeLabel,
  parseWallClock,
  type HourFormat,
} from './timezoneOffsets'

const HOUR_FORMAT_OPTIONS: { label: string; value: HourFormat }[] = [
  { label: '24h', value: '24h' },
  { label: '12h', value: '12h' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function nowInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Read fresh rather than cached, so a browser time zone change mid-session
// (DST, or actually changing the OS zone while the tab stays open) doesn't
// leave a stale offset baked into an already-open widget or into "Now".
function currentLocalOffsetMinutes(): number {
  return closestOffsetMinutes(-new Date().getTimezoneOffset())
}

// 24-hour by default: the offset labels above the result are already in
// ISO-style "+02:00" notation, and 24-hour avoids the AM/PM ambiguity that
// matters most for a tool people reach for across time zones.
const DEFAULT_HOUR_FORMAT: HourFormat = '24h'

export default function TimezoneCalculatorWidget({ instanceId }: WidgetProps) {
  // Captured once per mounted instance (not at module load) so every field
  // that opens on "the browser's current offset" agrees on the same
  // instant, without baking in a value that could go stale later in the
  // session — see currentLocalOffsetMinutes above.
  const localOffsetMinutes = useMemo(() => currentLocalOffsetMinutes(), [])
  const defaultFromOffset = localOffsetMinutes
  // A "From" and "To" that already match would make the widget open on a
  // no-op conversion, so the default target is UTC unless that's exactly
  // where "From" already starts.
  const defaultToOffset = localOffsetMinutes === 0 ? 60 : 0

  const [dateInput, setDateInput] = useWidgetState(instanceId, 'dateInput', nowInput)
  // Same "capture the mount-time default once" trick WorldClockWidget uses
  // for its city selection — but unlike that one, this default (the current
  // time) is a moving target, so the naive version of this trick only ever
  // captures whatever `dateInput` happens to be on THIS mount. That's fine
  // within one mount's lifetime, but on a remount `dateInput` itself already
  // reads back the persisted (possibly edited) value, so the naive version
  // would re-derive its "initial" baseline from the edit itself and quietly
  // forget that anything changed. The effect below commits a real baseline
  // to the shared store the one time it doesn't already have one, so it
  // actually survives a remount instead of re-deriving itself from
  // whatever `dateInput` is by then.
  const [initialDateInput, setInitialDateInput] = useWidgetState(instanceId, 'initialDateInput', dateInput)
  useEffect(() => {
    const key = `${instanceId}:initialDateInput`
    if (!(key in useWidgetStateStore.getState().values)) setInitialDateInput(dateInput)
    // Intentionally instanceId-only: this is a one-time-ever commit guarded
    // by the store check above, not something that should re-run just
    // because dateInput or the setter identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId])
  const [fromOffset, setFromOffset] = useWidgetState(instanceId, 'fromOffset', defaultFromOffset)
  const [toOffset, setToOffset] = useWidgetState(instanceId, 'toOffset', defaultToOffset)
  const [hourFormat, setHourFormat] = useWidgetState<HourFormat>(instanceId, 'hourFormat', DEFAULT_HOUR_FORMAT)

  useWidgetDirty(
    instanceId,
    dateInput !== initialDateInput ||
      fromOffset !== defaultFromOffset ||
      toOffset !== defaultToOffset ||
      hourFormat !== DEFAULT_HOUR_FORMAT,
  )

  const dateFieldId = useId()
  const fromFieldId = useId()
  const toFieldId = useId()

  const handleNow = () => {
    setDateInput(nowInput())
    setFromOffset(currentLocalOffsetMinutes())
  }

  const handleSwap = () => {
    setFromOffset(toOffset)
    setToOffset(fromOffset)
  }

  const wallClock = parseWallClock(dateInput)
  const result = wallClock ? convertOffset(wallClock, fromOffset, toOffset) : null
  const dayDiffLabel = result ? formatDayDiffLabel(result.dayDiff) : null
  const resultText = result
    ? `${formatDateLabel(result.target)}, ${formatTimeLabel(result.target, hourFormat)} (${formatOffsetLabel(toOffset)})`
    : null

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-end gap-1.5">
        <Field label="Time" htmlFor={dateFieldId} className="min-w-0 flex-1">
          <Input
            id={dateFieldId}
            type="datetime-local"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            className="w-full font-mono"
          />
        </Field>
        <Button type="button" variant="outline" size="sm" onClick={handleNow} className="h-8 shrink-0">
          Now
        </Button>
      </div>

      <div className="flex items-end gap-1.5">
        <Field label="From" htmlFor={fromFieldId} className="min-w-0 flex-1">
          <OffsetSelect id={fromFieldId} value={fromOffset} onChange={setFromOffset} />
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSwap}
          aria-label="Swap offsets"
          className="mb-0.5 shrink-0"
        >
          <ArrowLeftRight className="size-3.5" />
        </Button>
        <Field label="To" htmlFor={toFieldId} className="min-w-0 flex-1">
          <OffsetSelect id={toFieldId} value={toOffset} onChange={setToOffset} />
        </Field>
      </div>

      <div className="mt-auto flex items-center gap-1.5">
        <SegmentedControl value={hourFormat} onChange={setHourFormat} options={HOUR_FORMAT_OPTIONS} />
        <CopyButton value={resultText ?? ''} label="" className="ml-auto" />
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md bg-background p-2 dark:bg-muted/40">
        {result ? (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-base font-semibold text-foreground">
              <span className="truncate">{formatTimeLabel(result.target, hourFormat)}</span>
              {dayDiffLabel && (
                <span className={dayDiffLabel.startsWith('+') ? 'text-primary' : 'text-destructive'}>
                  {dayDiffLabel}
                </span>
              )}
            </div>
            <div className="truncate text-muted-foreground">
              {formatDateLabel(result.target)} · {formatOffsetLabel(toOffset)}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Enter a time to convert</span>
        )}
      </div>
    </div>
  )
}

function OffsetSelect({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {UTC_OFFSETS.map((option) => (
        <option key={option.minutes} value={option.minutes}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

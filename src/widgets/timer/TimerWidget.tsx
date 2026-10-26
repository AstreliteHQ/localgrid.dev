import { useEffect, useState } from 'react'
import { Flag, Pause, Play, RotateCcw } from 'lucide-react'
import { NumberField } from '@/components/NumberField'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import { useWidgetConfig } from '@/widgets/widgetConfig'
import type { WidgetProps } from '@/widgets/types'
import {
  clampPart,
  computeStopwatchElapsedMs,
  COUNTDOWN_RING_CIRCUMFERENCE,
  COUNTDOWN_RING_RADIUS,
  countdownRingOffset,
  durationFromParts,
  formatClockDate,
  formatClockTime,
  formatDurationTime,
  type TimerMode,
} from './timer'

const COUNTDOWN_PRESETS: { label: string; hours: number; minutes: number; seconds: number }[] = [
  { label: '1 min', hours: 0, minutes: 1, seconds: 0 },
  { label: '5 min', hours: 0, minutes: 5, seconds: 0 },
  { label: '10 min', hours: 0, minutes: 10, seconds: 0 },
  { label: '30 min', hours: 0, minutes: 30, seconds: 0 },
]

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// Shared by the clock and stopwatch's single-line digit display. Steps up
// through Tailwind's container-query breakpoints (of the `@container` on
// the widget root) as the widget's own rendered width grows — a small grid
// cell stays legible, and the much wider fullscreen overlay gets a display
// that actually fills it instead of floating tiny in the middle.
const TIME_TEXT_CLASS =
  'font-mono text-2xl @xs:text-3xl @sm:text-4xl @md:text-5xl @lg:text-6xl @2xl:text-7xl font-semibold tabular-nums'

// Countdown ring diameter and its inner digit size, stepping in tandem
// through the same breakpoints so the digits keep a comfortable margin
// inside the ring at every size. Two tiers taller than the clock/stopwatch
// text scale — the ring's own container (see CountdownPanel) reclaims the
// shell's padding, so it has the extra room to use them.
const COUNTDOWN_RING_SIZE_CLASS =
  'size-28 @xs:size-32 @sm:size-40 @md:size-48 @lg:size-56 @2xl:size-64 @3xl:size-72 @4xl:size-80'
const COUNTDOWN_TEXT_CLASS =
  'font-mono text-base @xs:text-lg @sm:text-xl @md:text-2xl @lg:text-3xl @2xl:text-4xl @4xl:text-5xl font-semibold tabular-nums'

/** Three-in-one time widget: a live local clock, a lap-capable stopwatch,
 * and a countdown timer that alerts on completion. Sharing one widget
 * (rather than three) keeps the tool browser from getting cluttered with
 * near-duplicate entries, and lets a single dashboard cell serve whichever
 * of the three someone reaches for at a given moment. */
export default function TimerWidget({ instanceId }: WidgetProps) {
  const [mode, setMode] = useWidgetState<TimerMode>(instanceId, 'mode', 'clock')

  const [swRunning, setSwRunning] = useWidgetState(instanceId, 'swRunning', false)
  const [swAccumulatedMs, setSwAccumulatedMs] = useWidgetState(instanceId, 'swAccumulatedMs', 0)
  const [swStartedAt, setSwStartedAt] = useWidgetState<number | null>(instanceId, 'swStartedAt', null)
  const [swLaps, setSwLaps] = useWidgetState<number[]>(instanceId, 'swLaps', [])

  // The countdown preset is configuration; the running countdown is state.
  const [cdHours, setCdHours] = useWidgetConfig(instanceId, 'cdHours', 0)
  const [cdMinutes, setCdMinutes] = useWidgetConfig(instanceId, 'cdMinutes', 5)
  const [cdSeconds, setCdSeconds] = useWidgetConfig(instanceId, 'cdSeconds', 0)
  const [cdRemainingMs, setCdRemainingMs] = useWidgetState(instanceId, 'cdRemainingMs', 0)
  const [cdEndAt, setCdEndAt] = useWidgetState<number | null>(instanceId, 'cdEndAt', null)
  const [cdRunning, setCdRunning] = useWidgetState(instanceId, 'cdRunning', false)
  const [cdStarted, setCdStarted] = useWidgetState(instanceId, 'cdStarted', false)
  const [cdFinished, setCdFinished] = useWidgetState(instanceId, 'cdFinished', false)

  // Only an actually-run stopwatch or countdown counts as "dirty" — like
  // JsonFormatterWidget's viewMode, switching tabs or nudging the countdown
  // fields without starting anything isn't a meaningful change to persist.
  useWidgetDirty(instanceId, swRunning || swAccumulatedMs > 0 || swLaps.length > 0 || cdStarted)

  // Ticks the shared clock while whichever section is actually visible
  // needs live updates — the clock face once a second, the stopwatch and
  // the countdown every 100ms for smooth centiseconds (and a smooth ring
  // sweep). A mode/segment not currently shown keeps its state (elapsed
  // time, remaining time) but stops re-rendering, which is fine: both are
  // derived from real timestamps, not from tick count, so switching back
  // immediately shows the correct value — with one catch: `now` itself
  // only advances while a tick is actually running, so it can sit stale
  // for however long nothing needed it (paused, or a different tab
  // showing). Reading a stale `now` is harmless for the stopwatch's
  // "accumulated + elapsed" math (a too-small `now` just clamps to no
  // extra elapsed time), but the countdown's "endAt − now" math has no
  // such clamp on the low side, so a stale `now` briefly overstates the
  // time remaining — the countdown visibly jumping backward right after
  // Resume. Every handler below that starts a fresh running segment
  // (Start/Resume, on either the stopwatch or the countdown, and
  // switching back to the clock face) refreshes `now` itself rather than
  // waiting for the next tick.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (mode === 'clock') {
      const id = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(id)
    }
    if (mode === 'stopwatch' && swRunning) {
      const id = setInterval(() => setNow(Date.now()), 100)
      return () => clearInterval(id)
    }
    if (mode === 'countdown' && cdRunning) {
      const id = setInterval(() => setNow(Date.now()), 100)
      return () => clearInterval(id)
    }
  }, [mode, swRunning, cdRunning])

  const elapsedMs = computeStopwatchElapsedMs({ accumulatedMs: swAccumulatedMs, startedAt: swStartedAt }, now)
  const remainingMs = cdRunning && cdEndAt !== null ? Math.max(0, cdEndAt - now) : cdRemainingMs
  const countdownDurationMs = durationFromParts(cdHours, cdMinutes, cdSeconds)

  // Fires once remaining time hits zero while running — stops the
  // countdown, flags it finished, and plays the alert.
  useEffect(() => {
    if (!cdRunning || remainingMs > 0) return
    setCdRunning(false)
    setCdEndAt(null)
    setCdRemainingMs(0)
    setCdFinished(true)
    playAlarm()
  }, [cdRunning, remainingMs, setCdRunning, setCdEndAt, setCdRemainingMs, setCdFinished])

  const handleStopwatchStartPause = () => {
    if (swRunning) {
      // Read the current time directly rather than trusting `elapsedMs`
      // (derived from the `now` state, itself only as fresh as the last
      // 100ms tick) — otherwise pausing can lose up to a tick's worth of
      // centiseconds off the accumulated total.
      const stoppedAt = Date.now()
      setNow(stoppedAt)
      setSwAccumulatedMs(
        computeStopwatchElapsedMs({ accumulatedMs: swAccumulatedMs, startedAt: swStartedAt }, stoppedAt),
      )
      setSwStartedAt(null)
      setSwRunning(false)
    } else {
      setNow(Date.now())
      setSwStartedAt(Date.now())
      setSwRunning(true)
    }
  }
  const handleStopwatchLap = () => {
    // Same freshness concern as pausing above — a lap should record the
    // time at the click, not whatever `now` last ticked to.
    const lappedAt = Date.now()
    setNow(lappedAt)
    const lapMs = computeStopwatchElapsedMs({ accumulatedMs: swAccumulatedMs, startedAt: swStartedAt }, lappedAt)
    setSwLaps((prev) => [lapMs, ...prev])
  }
  const handleStopwatchReset = () => {
    setSwRunning(false)
    setSwStartedAt(null)
    setSwAccumulatedMs(0)
    setSwLaps([])
  }

  const handleCountdownStart = () => {
    if (countdownDurationMs <= 0) return
    setNow(Date.now())
    setCdRemainingMs(countdownDurationMs)
    setCdEndAt(Date.now() + countdownDurationMs)
    setCdRunning(true)
    setCdStarted(true)
    setCdFinished(false)
  }
  const handleCountdownPause = () => {
    setCdRemainingMs(remainingMs)
    setCdEndAt(null)
    setCdRunning(false)
  }
  const handleCountdownResume = () => {
    setNow(Date.now())
    setCdEndAt(Date.now() + cdRemainingMs)
    setCdRunning(true)
  }
  const handleCountdownReset = () => {
    setCdRunning(false)
    setCdStarted(false)
    setCdFinished(false)
    setCdEndAt(null)
    setCdRemainingMs(countdownDurationMs)
  }
  const applyCountdownPreset = (preset: (typeof COUNTDOWN_PRESETS)[number]) => {
    setCdHours(preset.hours)
    setCdMinutes(preset.minutes)
    setCdSeconds(preset.seconds)
  }

  return (
    // `@container` turns the widget's own box into a container-query
    // context, so the big digit displays below can scale off *this*
    // element's actual rendered width — a resized grid cell, a narrow
    // sidebar tool, or the much larger fullscreen overlay all just work,
    // with no need to special-case `mode`.
    <div className="@container flex h-full flex-col gap-2 text-xs">
      <SegmentedControl
        value={mode}
        onChange={(nextMode) => {
          // Same staleness the Start/Resume handlers below correct for:
          // `now` only ticks for the section actually on screen, so
          // switching back to the clock face after a while elsewhere would
          // otherwise flash whatever stale value `now` last held until the
          // next 1s tick caught it up.
          setNow(Date.now())
          setMode(nextMode)
        }}
        className="self-start"
        options={[
          { label: 'Clock', value: 'clock' },
          { label: 'Stopwatch', value: 'stopwatch' },
          { label: 'Countdown', value: 'countdown' },
        ]}
      />

      {mode === 'clock' && <ClockPanel now={now} />}

      {mode === 'stopwatch' && (
        <StopwatchPanel
          elapsedMs={elapsedMs}
          running={swRunning}
          laps={swLaps}
          onStartPause={handleStopwatchStartPause}
          onLap={handleStopwatchLap}
          onReset={handleStopwatchReset}
        />
      )}

      {mode === 'countdown' && (
        <CountdownPanel
          hours={cdHours}
          minutes={cdMinutes}
          seconds={cdSeconds}
          onHoursChange={(v) => setCdHours(clampPart(v, 99))}
          onMinutesChange={(v) => setCdMinutes(clampPart(v, 59))}
          onSecondsChange={(v) => setCdSeconds(clampPart(v, 59))}
          onApplyPreset={applyCountdownPreset}
          durationMs={countdownDurationMs}
          remainingMs={remainingMs}
          running={cdRunning}
          started={cdStarted}
          finished={cdFinished}
          onStart={handleCountdownStart}
          onPause={handleCountdownPause}
          onResume={handleCountdownResume}
          onReset={handleCountdownReset}
        />
      )}
    </div>
  )
}

function ClockPanel({ now }: { now: number }) {
  const date = new Date(now)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1">
      <span className={cn(TIME_TEXT_CLASS, 'text-foreground')}>{formatClockTime(date)}</span>
      <span className="text-muted-foreground @sm:text-sm @lg:text-base">{formatClockDate(date)}</span>
      <span className="text-[11px] text-muted-foreground @sm:text-xs @lg:text-sm">{TIME_ZONE}</span>
    </div>
  )
}

function StopwatchPanel({
  elapsedMs,
  running,
  laps,
  onStartPause,
  onLap,
  onReset,
}: {
  elapsedMs: number
  running: boolean
  laps: number[]
  onStartPause: () => void
  onLap: () => void
  onReset: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-1 flex-col items-center justify-center gap-1">
        <span className={cn(TIME_TEXT_CLASS, 'text-foreground')}>{formatDurationTime(elapsedMs)}</span>
      </div>

      <div className="flex justify-center gap-1.5">
        <Button type="button" size="sm" onClick={onStartPause} className="w-20">
          {running ? (
            <>
              <Pause className="size-3.5" />
              Pause
            </>
          ) : (
            <>
              <Play className="size-3.5" />
              {elapsedMs > 0 ? 'Resume' : 'Start'}
            </>
          )}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onLap} disabled={!running}>
          <Flag className="size-3.5" />
          Lap
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReset}
          disabled={!running && elapsedMs === 0 && laps.length === 0}
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {laps.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          {laps.map((lapMs, index) => {
            const lapNumber = laps.length - index
            const splitMs = index === laps.length - 1 ? lapMs : lapMs - laps[index + 1]
            return (
              <div
                key={lapNumber}
                className={cn(
                  'flex items-center justify-between gap-2 px-2 py-1 font-mono',
                  index > 0 && 'border-t border-border',
                )}
              >
                <span className="shrink-0 text-muted-foreground">Lap {lapNumber}</span>
                <span className="text-foreground">{formatDurationTime(splitMs)}</span>
                <span className="shrink-0 text-muted-foreground">{formatDurationTime(lapMs)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CountdownPanel({
  hours,
  minutes,
  seconds,
  onHoursChange,
  onMinutesChange,
  onSecondsChange,
  onApplyPreset,
  durationMs,
  remainingMs,
  running,
  started,
  finished,
  onStart,
  onPause,
  onResume,
  onReset,
}: {
  hours: number
  minutes: number
  seconds: number
  onHoursChange: (value: number) => void
  onMinutesChange: (value: number) => void
  onSecondsChange: (value: number) => void
  onApplyPreset: (preset: (typeof COUNTDOWN_PRESETS)[number]) => void
  durationMs: number
  remainingMs: number
  running: boolean
  started: boolean
  finished: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
}) {
  if (!started) {
    return (
      <div className="flex flex-1 flex-col gap-2">
        <div className="grid grid-cols-3 gap-1">
          <NumberField label="Hours" value={hours} min={0} max={99} onChange={onHoursChange} />
          <NumberField label="Minutes" value={minutes} min={0} max={59} onChange={onMinutesChange} />
          <NumberField label="Seconds" value={seconds} min={0} max={59} onChange={onSecondsChange} />
        </div>

        <div className="flex flex-wrap gap-1">
          {COUNTDOWN_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="secondary"
              onClick={() => onApplyPreset(preset)}
              className="h-auto rounded px-1.5 py-1 text-muted-foreground"
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {durationMs <= 0 && <ErrorMessage>Set a duration greater than zero</ErrorMessage>}

        <Button type="button" size="sm" onClick={onStart} disabled={durationMs <= 0} className="mt-auto w-fit">
          <Play className="size-3.5" />
          Start
        </Button>
      </div>
    )
  }

  return (
    // `-mx-2 @container` claws back the WidgetShell's own left/right
    // padding and opens a fresh, nested container-query context sized off
    // that reclaimed width — the ring and its digits below key off *this*
    // box (the nearest `@container` wins), so they scale a size tier
    // further than they could squeezed inside the shell's padding.
    <div className="-mx-2 flex flex-1 flex-col gap-2 @container">
      <div className="flex flex-1 flex-col items-center justify-center gap-1">
        <div className={cn('relative flex shrink-0 items-center justify-center', COUNTDOWN_RING_SIZE_CLASS)}>
          <CountdownRing remainingMs={remainingMs} durationMs={durationMs} finished={finished} />
          <span className={cn(COUNTDOWN_TEXT_CLASS, finished ? 'text-destructive' : 'text-foreground')}>
            {formatDurationTime(remainingMs)}
          </span>
        </div>
        {finished && <span className="font-medium text-destructive">Time&apos;s up!</span>}
      </div>

      <div className="flex justify-center gap-1.5">
        {running ? (
          <Button type="button" size="sm" onClick={onPause}>
            <Pause className="size-3.5" />
            Pause
          </Button>
        ) : (
          !finished && (
            <Button type="button" size="sm" onClick={onResume}>
              <Play className="size-3.5" />
              Resume
            </Button>
          )
        )}
        <Button type="button" size="sm" variant="outline" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>
    </div>
  )
}

/** Ring that sweeps from full to empty as the countdown runs down, landing
 * on a fully-depleted ring exactly when `remainingMs` hits zero — the same
 * geometry a physical kitchen timer's dial traces. Purely decorative (the
 * digits underneath already state the exact time), so hidden from
 * assistive tech; a CSS transition smooths the motion between the 100ms
 * ticks driving `remainingMs`, the same trick CronWidget's trigger
 * progress bars use for their once-a-second updates. */
function CountdownRing({
  remainingMs,
  durationMs,
  finished,
}: {
  remainingMs: number
  durationMs: number
  finished: boolean
}) {
  const offset = countdownRingOffset(remainingMs, durationMs)
  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={COUNTDOWN_RING_RADIUS} fill="none" strokeWidth="8" className="stroke-muted" />
      <circle
        cx="60"
        cy="60"
        r={COUNTDOWN_RING_RADIUS}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={COUNTDOWN_RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        className={cn(
          'transition-[stroke-dashoffset] duration-100 ease-linear motion-reduce:transition-none',
          finished ? 'stroke-destructive' : 'stroke-primary',
        )}
      />
    </svg>
  )
}

/** Three short beeps via the Web Audio API — no bundled audio asset needed.
 * Wrapped in try/catch since AudioContext can be unavailable (jsdom in
 * tests, an older browser) or blocked by an autoplay policy; the visual
 * "Time's up" state still communicates completion either way. */
function playAlarm(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const beepAt = (offsetSeconds: number) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      const start = ctx.currentTime + offsetSeconds
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.22)
    }
    beepAt(0)
    beepAt(0.3)
    beepAt(0.6)
    setTimeout(() => void ctx.close(), 1200)
  } catch {
    // Nothing to do — see comment above.
  }
}

import { useEffect, useId, type CSSProperties } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { Field } from '@/components/Field'
import { NumberInput } from '@/components/NumberField'
import { PageColorPicker } from '@/components/PageColorPicker'
import { ScreenColorPicker } from '@/components/ScreenColorPicker'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { InputSlot, OutputSlot } from '@/flow/FlowSlots'
import { useWidgetOutput } from '@/flow/useWidgetOutput'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  MAX_CHROMA,
  formatOklab,
  formatOklch,
  isInP3,
  isInSrgb,
  parseColor,
  toSrgbColord,
  toSrgbGamut,
  type Oklch,
} from './oklch'

export const DEFAULT_INPUT = 'oklch(70% 0.15 250)'
const DEFAULT_COLOR = parseColor(DEFAULT_INPUT)!

/** Checkerboard behind the swatch and the alpha track, so transparency
 * reads as transparency in both themes. */
const CHECKERBOARD = 'repeating-conic-gradient(var(--muted) 0 25%, transparent 0 50%) 0 0 / 10px 10px'

const HUE_STOPS = Array.from({ length: 13 }, (_, i) => i * 30)
const LIGHTNESS_STOPS = Array.from({ length: 11 }, (_, i) => i / 10)

function css(color: Oklch): string {
  return formatOklch(color)
}

function gradient(stops: string[]): string {
  return `linear-gradient(to right, ${stops.join(', ')})`
}

interface ChannelSpec {
  key: keyof Oklch
  label: string
  name: string
  min: number
  max: number
  step: number
  /** Slider units per stored unit (lightness and alpha are shown as percent). */
  scale: number
  digits: number
  track: (color: Oklch) => string
}

const CHANNELS: ChannelSpec[] = [
  {
    key: 'l',
    label: 'L',
    name: 'Lightness',
    min: 0,
    max: 100,
    step: 0.1,
    scale: 100,
    digits: 2,
    track: (c) => gradient(LIGHTNESS_STOPS.map((l) => css({ ...c, l, alpha: 1 }))),
  },
  {
    key: 'c',
    label: 'C',
    name: 'Chroma',
    min: 0,
    max: MAX_CHROMA,
    step: 0.001,
    scale: 1,
    digits: 4,
    track: (c) => gradient([0, 0.1, 0.2, 0.3, 0.4].map((chroma) => css({ ...c, c: chroma, alpha: 1 }))),
  },
  {
    key: 'h',
    label: 'H',
    name: 'Hue',
    min: 0,
    max: 360,
    step: 0.1,
    scale: 1,
    digits: 2,
    // A grey hue track says nothing, so it borrows some chroma when there is none.
    track: (c) => gradient(HUE_STOPS.map((h) => css({ ...c, c: Math.max(c.c, 0.1), h, alpha: 1 }))),
  },
  {
    key: 'alpha',
    label: 'A',
    name: 'Alpha',
    min: 0,
    max: 100,
    step: 1,
    scale: 100,
    digits: 1,
    track: (c) => `${gradient([css({ ...c, alpha: 0 }), css({ ...c, alpha: 1 })])}, ${CHECKERBOARD}`,
  },
]

export default function OklchColorWidget({ instanceId }: WidgetProps) {
  // `input` is the single source of truth (and the flow input): sliders
  // write an `oklch()` string into it, and every view is derived from it.
  const [input, setInput] = useWidgetState(instanceId, 'input', DEFAULT_INPUT)
  // Shown while the text is mid-edit or invalid, so the sliders and
  // conversions don't jump to black on every keystroke.
  const [lastValid, setLastValid] = useWidgetState<Oklch>(instanceId, 'lastValid', DEFAULT_COLOR)
  useWidgetDirty(instanceId, input !== DEFAULT_INPUT)

  const parsed = parseColor(input)
  const color = parsed ?? lastValid
  const parsedKey = parsed ? formatOklch(parsed) : null

  useEffect(() => {
    if (parsed && parsedKey !== formatOklch(lastValid)) setLastValid(parsed)
    // Keyed on the formatted string so a fresh but equal object doesn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedKey])

  const oklchString = formatOklch(color)
  useWidgetOutput(instanceId, oklchString)

  const inSrgb = isInSrgb(color)
  const inP3 = isInP3(color)
  const srgb = toSrgbColord(color)
  const mapped = toSrgbGamut(color)

  const setChannel = (key: keyof Oklch, value: number) => {
    setInput(formatOklch({ ...color, [key]: value }))
  }
  const handlePick = (hex: string) => {
    const picked = parseColor(hex)
    if (picked) setInput(formatOklch(picked))
  }

  const inputId = useId()

  const conversions = [
    { label: 'OKLCH', value: oklchString },
    { label: 'OKLab', value: formatOklab(color) },
    { label: 'HEX', value: srgb.toHex(), srgbOnly: true },
    { label: 'RGB', value: srgb.toRgbString(), srgbOnly: true },
    { label: 'HSL', value: srgb.toHslString(), srgbOnly: true },
  ]

  return (
    <div className="@container flex h-full flex-col gap-2 overflow-auto text-xs">
      <InputSlot input="input">
        <Field
          label="Color"
          htmlFor={inputId}
          error={parsed ? null : 'Not a color. Try oklch(), hex, rgb(), hsl() or a name.'}
        >
          <div className="flex items-center gap-1.5">
            <Input
              id={inputId}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="oklch(70% 0.15 250), #65a1fe, rgb(…)"
              spellCheck={false}
              aria-invalid={!parsed}
              className="min-w-0 flex-1 font-mono"
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <PageColorPicker onPick={handlePick} />
              <ScreenColorPicker onPick={handlePick} />
            </div>
          </div>
        </Field>
      </InputSlot>

      <div className="flex shrink-0 items-stretch gap-2">
        <Swatch color={color} srgbFallback={inSrgb ? null : srgb.toRgbString()} />
        <div className="flex shrink-0 flex-col justify-center gap-1">
          <GamutBadge label="sRGB" inside={inSrgb} />
          <GamutBadge label="P3" inside={inP3} />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
        {CHANNELS.map((channel) => (
          <ChannelRow key={channel.key} channel={channel} color={color} onChange={setChannel} />
        ))}
      </div>

      {!inSrgb && (
        <div
          role="status"
          className="flex shrink-0 items-start gap-1.5 rounded bg-tree-warn/10 px-2 py-1.5 text-tree-warn"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Outside sRGB{inP3 ? ' (fits Display P3)' : ''}. HEX, RGB and HSL use the closest sRGB color, chroma{' '}
            {Number(color.c.toFixed(4))} lowered to {Number(mapped.c.toFixed(4))}.
          </span>
        </div>
      )}

      <OutputSlot className="flex shrink-0 flex-col">
        {conversions.map(({ label, value, srgbOnly }) => (
          <div key={label} className="flex min-w-0 items-center gap-1">
            <span
              className={cn('w-11 shrink-0 text-muted-foreground', srgbOnly && !inSrgb && 'text-tree-warn')}
              title={srgbOnly && !inSrgb ? 'Mapped into sRGB' : undefined}
            >
              {label}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono" title={value}>
              {value}
            </span>
            <CopyButton value={value} label="" ariaLabel={`Copy ${label}`} />
          </div>
        ))}
      </OutputSlot>
    </div>
  )
}

function Swatch({ color, srgbFallback }: { color: Oklch; srgbFallback: string | null }) {
  return (
    <div
      className="flex h-12 min-w-0 flex-1 overflow-hidden rounded-lg border border-input"
      style={{ background: CHECKERBOARD }}
      aria-hidden="true"
    >
      <div className="relative flex-1" style={{ backgroundColor: css(color) }}>
        {srgbFallback && <SwatchLabel>OKLCH</SwatchLabel>}
      </div>
      {srgbFallback && (
        <div className="relative flex-1 border-l border-input" style={{ backgroundColor: srgbFallback }}>
          <SwatchLabel>sRGB</SwatchLabel>
        </div>
      )}
    </div>
  )
}

function SwatchLabel({ children }: { children: string }) {
  return (
    <span className="absolute bottom-0.5 left-1 rounded bg-background/80 px-1 text-[10px] leading-tight text-foreground">
      {children}
    </span>
  )
}

function GamutBadge({ label, inside }: { label: string; inside: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5',
        inside
          ? 'bg-success/15 text-success dark:bg-success/20'
          : 'bg-tree-warn/10 text-tree-warn dark:bg-tree-warn/20',
      )}
    >
      {inside ? (
        <Check className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <X className="size-3 shrink-0" aria-hidden="true" />
      )}
      <span className="sr-only">{inside ? 'Inside ' : 'Outside '}</span>
      {label}
    </span>
  )
}

function ChannelRow({
  channel,
  color,
  onChange,
}: {
  channel: ChannelSpec
  color: Oklch
  onChange: (key: keyof Oklch, value: number) => void
}) {
  const { key, label, name, min, max, step, scale, digits } = channel
  const shown = Number((color[key] * scale).toFixed(digits))
  const commit = (next: number) => onChange(key, Math.min(max, Math.max(min, next)) / scale)
  const trackStyle: CSSProperties = { background: channel.track(color) }

  return (
    <>
      <span className="text-muted-foreground" title={name}>
        {label}
      </span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={shown}
        onValueChange={commit}
        aria-label={name}
        trackStyle={trackStyle}
      />
      <NumberInput
        value={shown}
        min={min}
        max={max}
        step={step}
        onChange={commit}
        aria-label={`${name} value`}
        className="h-6 w-[4.5rem] px-1.5 text-xs tabular-nums md:text-xs"
      />
    </>
  )
}

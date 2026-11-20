import { useId, type ReactNode } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/formatNumber'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  LINEAR_CATEGORIES,
  TEMPERATURE_UNITS,
  TIME_UNITS,
  convertLinear,
  convertRate,
  convertTemperature,
  supportsRate,
  type LinearCategoryId,
  type TemperatureUnitId,
} from './unitConversions'

type CategoryId = LinearCategoryId | 'temperature'

const CATEGORY_OPTIONS: { label: string; value: CategoryId }[] = [
  { label: 'Length', value: 'length' },
  { label: 'Mass', value: 'mass' },
  { label: 'Volume', value: 'volume' },
  { label: 'Data', value: 'data' },
  { label: 'Time', value: 'time' },
  { label: 'Temp', value: 'temperature' },
]

function unitsFor(category: CategoryId): { id: string; label: string; symbol: string }[] {
  return category === 'temperature' ? TEMPERATURE_UNITS : LINEAR_CATEGORIES[category].units
}

function parseNumber(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const DEFAULT_CATEGORY: CategoryId = 'length'
const DEFAULT_VALUE = '1'
const DEFAULT_PER_UNIT = 's'

function findUnit(units: { id: string; toBase: number }[], id: string) {
  return units.find((u) => u.id === id)
}

export default function UnitConverterWidget({ instanceId }: WidgetProps) {
  const [category, setCategory] = useWidgetState<CategoryId>(instanceId, 'category', DEFAULT_CATEGORY)
  const [fromUnit, setFromUnit] = useWidgetState(instanceId, 'fromUnit', 'm')
  const [toUnit, setToUnit] = useWidgetState(instanceId, 'toUnit', 'ft')
  const [value, setValue] = useWidgetState(instanceId, 'value', DEFAULT_VALUE)
  const [perTime, setPerTime] = useWidgetState(instanceId, 'perTime', false)
  const [fromPer, setFromPer] = useWidgetState(instanceId, 'fromPer', DEFAULT_PER_UNIT)
  const [toPer, setToPer] = useWidgetState(instanceId, 'toPer', DEFAULT_PER_UNIT)
  useWidgetDirty(instanceId, category !== DEFAULT_CATEGORY || value !== DEFAULT_VALUE || perTime)
  const valueId = useId()
  const fromId = useId()
  const toId = useId()
  const fromPerId = useId()
  const toPerId = useId()
  const rateAvailable = supportsRate(category)
  const isRate = rateAvailable && perTime

  const handleCategoryChange = (next: CategoryId) => {
    setCategory(next)
    const units = unitsFor(next)
    setFromUnit(units[0].id)
    setToUnit(units[1]?.id ?? units[0].id)
  }

  const handleSwap = () => {
    setFromUnit(toUnit)
    setToUnit(fromUnit)
    setFromPer(toPer)
    setToPer(fromPer)
  }

  const parsedValue = parseNumber(value)
  const result = (() => {
    if (parsedValue === null) return null
    if (category === 'temperature') {
      return convertTemperature(parsedValue, fromUnit as TemperatureUnitId, toUnit as TemperatureUnitId)
    }
    const units = LINEAR_CATEGORIES[category].units
    const from = findUnit(units, fromUnit)
    const to = findUnit(units, toUnit)
    if (!from || !to) return null
    if (isRate) {
      const fromPerUnit = findUnit(TIME_UNITS, fromPer)
      const toPerUnit = findUnit(TIME_UNITS, toPer)
      if (!fromPerUnit || !toPerUnit) return null
      return convertRate(
        parsedValue,
        { toBase: from.toBase, perToBase: fromPerUnit.toBase },
        { toBase: to.toBase, perToBase: toPerUnit.toBase },
      )
    }
    return convertLinear(parsedValue, from.toBase, to.toBase)
  })()
  const resultText = result !== null ? formatNumber(result) : null
  const resultUnit = (() => {
    const symbol = unitsFor(category).find((u) => u.id === toUnit)?.symbol ?? ''
    if (!isRate) return symbol
    return `${symbol}/${TIME_UNITS.find((u) => u.id === toPer)?.symbol ?? ''}`
  })()
  const resultWithUnit = resultText !== null ? `${resultText} ${resultUnit}` : null

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto text-xs">
      <SegmentedControl
        value={category}
        onChange={handleCategoryChange}
        options={CATEGORY_OPTIONS}
        className="flex-wrap"
      />

      <div className="flex items-end gap-2">
        <Field label="Value" htmlFor={valueId} className="min-w-0 flex-1">
          <Input
            id={valueId}
            type="number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="font-mono"
          />
        </Field>
        {rateAvailable && (
          <label className="flex h-8 shrink-0 items-center gap-1.5 text-muted-foreground">
            <input
              type="checkbox"
              checked={perTime}
              onChange={(event) => setPerTime(event.target.checked)}
              className="accent-primary"
            />
            Per time
          </label>
        )}
      </div>

      <div className="flex items-start gap-1.5">
        <Field label="From" htmlFor={fromId} className="min-w-0 flex-1">
          <UnitSelect id={fromId} value={fromUnit} onChange={setFromUnit} options={unitsFor(category)} />
          {isRate && <PerSelect id={fromPerId} label="From per" value={fromPer} onChange={setFromPer} />}
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSwap}
          aria-label="Swap units"
          className="mt-[1.125rem] shrink-0"
        >
          <ArrowLeftRight className="size-3.5" />
        </Button>
        <Field label="To" htmlFor={toId} className="min-w-0 flex-1">
          <UnitSelect id={toId} value={toUnit} onChange={setToUnit} options={unitsFor(category)} />
          {isRate && <PerSelect id={toPerId} label="To per" value={toPer} onChange={setToPer} />}
        </Field>
      </div>

      <div className="flex shrink-0 flex-col rounded-md bg-background px-2 py-1 font-mono dark:bg-muted/40">
        {resultText !== null ? (
          <>
            <ResultRow value={resultText} copyLabel="Copy result" className="text-base leading-6" />
            <ResultRow
              value={resultWithUnit ?? ''}
              copyLabel="Copy result with unit"
              className="text-xs leading-5 text-muted-foreground"
            />
          </>
        ) : (
          <span className="py-1 text-sm text-muted-foreground">Enter a value</span>
        )}
      </div>
    </div>
  )
}

function ResultRow({
  value,
  copyLabel,
  className,
}: {
  value: string
  copyLabel: string
  className?: string
}): ReactNode {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-2', className)}>
      <span className="truncate">{value}</span>
      <CopyButton value={value} label="" ariaLabel={copyLabel} className="py-0.5" />
    </div>
  )
}

function PerSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}): ReactNode {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">
        per
      </span>
      <UnitSelect id={id} value={value} onChange={onChange} options={TIME_UNITS} ariaLabel={label} />
    </div>
  )
}

function UnitSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: { id: string; label: string }[]
  ariaLabel?: string
}): ReactNode {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

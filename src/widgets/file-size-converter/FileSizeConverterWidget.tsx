import { useId } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/formatNumber'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  ALL_UNITS,
  BINARY_UNITS,
  BIT_UNIT,
  DECIMAL_UNITS,
  findUnit,
  fromBytes,
  parseSize,
  toBytes,
  type SizeUnit,
} from './fileSizeConversions'

// A 1 GB file is the canonical example of the decimal/binary gap this
// widget exists to make obvious: it shows as ~931 MiB, not 1000 MiB, the
// moment the widget opens.
const DEFAULT_VALUE = '1'
const DEFAULT_UNIT = 'GB'

const SELECT_CLASS =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30'

export default function FileSizeConverterWidget({ instanceId }: WidgetProps) {
  const [value, setValue] = useWidgetState(instanceId, 'value', DEFAULT_VALUE)
  const [unit, setUnit] = useWidgetState(instanceId, 'unit', DEFAULT_UNIT)
  useWidgetDirty(instanceId, value !== DEFAULT_VALUE || unit !== DEFAULT_UNIT)
  const valueId = useId()
  const unitId = useId()

  const parsed = parseSize(value)
  const hasError = value.trim() !== '' && parsed === null
  const fromUnit = findUnit(unit) ?? findUnit(DEFAULT_UNIT)!
  const bytes = parsed !== null ? toBytes(parsed, fromUnit) : null

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-end gap-1.5">
        <Field label="Size" htmlFor={valueId} className="min-w-0 flex-1">
          <Input
            id={valueId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="0"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
        <Field label="Unit" htmlFor={unitId} className="w-28 shrink-0">
          <select id={unitId} value={unit} onChange={(event) => setUnit(event.target.value)} className={SELECT_CLASS}>
            {ALL_UNITS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {hasError && <ErrorMessage>Enter a number</ErrorMessage>}

      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        <UnitGroup label="Bit" units={[BIT_UNIT]} bytes={bytes} />
        {/* Powers of 1000, the way a storage vendor or a cloud bill counts —
         * and, not coincidentally, what "Bytes" itself measures too. */}
        <UnitGroup label="Decimal (powers of 1000)" units={DECIMAL_UNITS} bytes={bytes} />
        {/* Powers of 1024, the way memory and most file managers count.
         * Same value, a visibly different number: a "1 GB" file reads as
         * ~931 MiB here, which is the whole point of showing both. */}
        <UnitGroup label="Binary (powers of 1024)" units={BINARY_UNITS} bytes={bytes} />
      </div>
    </div>
  )
}

function UnitGroup({ label, units, bytes }: { label: string; units: SizeUnit[]; bytes: number | null }) {
  return (
    <div>
      <p className="px-1 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="space-y-0.5">
        {units.map((unit) => (
          <SizeRow key={unit.id} unit={unit} bytes={bytes} />
        ))}
      </div>
    </div>
  )
}

function SizeRow({ unit, bytes }: { unit: SizeUnit; bytes: number | null }) {
  const text = bytes !== null ? formatNumber(fromBytes(bytes, unit)) : ''
  return (
    <div className={cn('flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-accent')}>
      <span className="shrink-0 text-muted-foreground">{unit.label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono">{text || '—'}</span>
        <CopyButton value={text} label="" className="shrink-0 px-1" />
      </div>
    </div>
  )
}

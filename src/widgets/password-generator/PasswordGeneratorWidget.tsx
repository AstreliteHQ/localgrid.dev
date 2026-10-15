import { useState } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NumberField } from '@/components/NumberField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { buildCharset, estimatePasswordStrength, generatePassword, type StrengthLabel } from './passwordGenerator'

const MIN_LENGTH = 4
const MAX_LENGTH = 128

const CHARSET_OPTIONS: { label: string; key: 'uppercase' | 'lowercase' | 'numbers' | 'symbols' }[] = [
  { label: 'A-Z', key: 'uppercase' },
  { label: 'a-z', key: 'lowercase' },
  { label: '0-9', key: 'numbers' },
  { label: '!@#', key: 'symbols' },
]

// Bar fill + label color per strength bucket — deliberately not tied to the
// `success`/`destructive` semantic tokens, since neither "very weak" nor
// "very strong" maps cleanly onto either and a five-step gradient reads
// better as a strength meter than a two-tone one.
const STRENGTH_STYLES: Record<StrengthLabel, { bar: string; text: string; percent: number }> = {
  'Very weak': { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', percent: 20 },
  Weak: { bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', percent: 40 },
  Fair: { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', percent: 60 },
  Strong: { bar: 'bg-lime-500', text: 'text-lime-600 dark:text-lime-400', percent: 80 },
  'Very strong': { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400', percent: 100 },
}

export default function PasswordGeneratorWidget({ instanceId }: WidgetProps) {
  const [length, setLength] = useWidgetState(instanceId, 'length', 16)
  const [uppercase, setUppercase] = useWidgetState(instanceId, 'uppercase', true)
  const [lowercase, setLowercase] = useWidgetState(instanceId, 'lowercase', true)
  const [numbers, setNumbers] = useWidgetState(instanceId, 'numbers', true)
  const [symbols, setSymbols] = useWidgetState(instanceId, 'symbols', false)
  const [excludeAmbiguous, setExcludeAmbiguous] = useWidgetState(instanceId, 'excludeAmbiguous', false)
  const [password, setPassword] = useWidgetState(instanceId, 'password', '')
  // Deliberately plain component state rather than useWidgetState: the
  // password is masked like a password field so it can't leak over a
  // shoulder or a screen share, and every reload starts masked again.
  const [revealed, setRevealed] = useState(false)

  useWidgetDirty(instanceId, password.length > 0)

  const options = { length, uppercase, lowercase, numbers, symbols, excludeAmbiguous }
  const charsetSize = buildCharset(options).length
  const canGenerate = charsetSize > 0
  const strength = estimatePasswordStrength(length, charsetSize)
  const strengthStyle = STRENGTH_STYLES[strength.label]

  const handleGenerate = () => {
    if (!canGenerate) return
    setPassword(generatePassword(options))
  }

  const toggleCharset = (key: 'uppercase' | 'lowercase' | 'numbers' | 'symbols') => {
    const setters = { uppercase: setUppercase, lowercase: setLowercase, numbers: setNumbers, symbols: setSymbols }
    setters[key]((prev) => !prev)
  }

  const charsetValues = { uppercase, lowercase, numbers, symbols }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Input
            readOnly
            type={revealed ? 'text' : 'password'}
            value={password}
            placeholder="Generated password"
            spellCheck={false}
            className="border-border bg-background p-2 pr-20 font-mono text-xs dark:bg-muted/40"
          />
          <div className="absolute right-1 top-1 flex items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRevealed((prev) => !prev)}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              aria-pressed={revealed}
              title={revealed ? 'Hide password' : 'Show password'}
              className="h-auto rounded px-1.5 py-1 text-muted-foreground hover:text-foreground"
            >
              {revealed ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </Button>
            <CopyButton value={password} />
          </div>
        </div>
        <Button type="button" size="sm" onClick={handleGenerate} disabled={!canGenerate} className="shrink-0">
          <RefreshCw className="size-3.5" />
          Generate
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', strengthStyle.bar)}
            style={{ width: `${strengthStyle.percent}%` }}
          />
        </div>
        <span className={cn('shrink-0 font-medium', strengthStyle.text)}>{strength.label}</span>
      </div>

      <NumberField label="Length" value={length} min={MIN_LENGTH} max={MAX_LENGTH} onChange={setLength} />

      <div className="flex flex-wrap gap-1">
        {CHARSET_OPTIONS.map(({ label, key }) => {
          const active = charsetValues[key]
          return (
            <Button
              key={key}
              type="button"
              onClick={() => toggleCharset(key)}
              aria-pressed={active}
              className={cn(
                'h-auto rounded px-1.5 py-1 font-mono',
                active
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
              )}
            >
              {label}
            </Button>
          )
        })}
      </div>

      <Button
        type="button"
        onClick={() => setExcludeAmbiguous((prev) => !prev)}
        aria-pressed={excludeAmbiguous}
        className={cn(
          'h-auto w-fit rounded px-1.5 py-1 font-normal',
          excludeAmbiguous
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
        )}
      >
        Exclude similar characters (l, 1, I, O, 0)
      </Button>

      {!canGenerate && <ErrorMessage>Select at least one character set</ErrorMessage>}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { colord } from 'colord'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Input } from '@/components/ui/input'
import { PageColorPicker } from '@/components/PageColorPicker'
import { ScreenColorPicker } from '@/components/ScreenColorPicker'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { generateMaterialPalette, type PaletteSwatch } from './materialPalette'

const INITIAL_HEX = '#2196f3'

export default function MaterialPaletteWidget({ instanceId }: WidgetProps) {
  const [hexInput, setHexInput] = useWidgetState(instanceId, 'hexInput', INITIAL_HEX)
  useWidgetDirty(instanceId, hexInput !== INITIAL_HEX)

  const palette = generateMaterialPalette(hexInput)

  const handlePick = (value: string) => {
    const parsed = colord(value)
    if (parsed.isValid()) setHexInput(parsed.toHex())
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center gap-1.5">
        <Input
          type="color"
          value={palette?.base ?? INITIAL_HEX}
          onChange={(event) => handlePick(event.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer p-0"
          aria-label="Pick a seed color"
        />
        <Input
          value={hexInput}
          onChange={(event) => setHexInput(event.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 font-mono"
          aria-label="Seed color hex"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <PageColorPicker onPick={handlePick} />
          <ScreenColorPicker onPick={handlePick} />
        </div>
      </div>

      {palette ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          <div className="grid grid-cols-5 gap-1">
            {palette.tones.map((swatch) => (
              <Swatch key={swatch.name} swatch={swatch} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {palette.accents.map((swatch) => (
              <Swatch key={swatch.name} swatch={swatch} />
            ))}
          </div>
        </div>
      ) : (
        <ErrorMessage>Enter a valid color to generate a palette</ErrorMessage>
      )}
    </div>
  )
}

function Swatch({ swatch }: { swatch: PaletteSwatch }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(swatch.hex)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1200)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ backgroundColor: swatch.hex, color: swatch.foreground }}
      className="flex flex-col justify-between gap-2 rounded px-1.5 py-1 text-left transition-transform hover:scale-[1.03]"
      title={`Copy ${swatch.hex}`}
    >
      <span className="text-[10px] font-medium opacity-80">{swatch.name}</span>
      <span className="truncate font-mono text-[10px]">
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : swatch.hex}
      </span>
    </button>
  )
}

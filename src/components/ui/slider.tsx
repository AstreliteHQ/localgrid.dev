import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/lib/utils'

// Every caller in this codebase wants a single-thumb slider, so this locks
// the primitive's `Value` generic to `number` (rather than also accepting
// `readonly number[]` for a multi-thumb range) to keep `onValueChange`
// callers narrowly typed without having to forward the generic themselves.
type SliderProps = Omit<React.ComponentProps<typeof SliderPrimitive.Root<number>>, 'value' | 'defaultValue'> & {
  value?: number
  defaultValue?: number
}

function Slider({ className, value, min = 0, max = 100, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root data-slot="slider" value={value} min={min} max={max} className={cn('w-full', className)} {...props}>
      <SliderPrimitive.Control className="flex w-full touch-none items-center py-1.5 select-none">
        <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-muted">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary" />
          <SliderPrimitive.Thumb
            className="block size-3.5 rounded-full border border-primary bg-background shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            // The primitive lines each thumb up with `SliderRoot.Props<Value>`'s
            // index count, which only matters for a multi-thumb (range)
            // slider — every caller here is a single value, so this is
            // always the first (and only) thumb.
            index={0}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

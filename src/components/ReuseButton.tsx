import { ArrowLeft, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SplitDirection } from '@/components/SplitPane'
import { cn } from '@/lib/utils'

interface ReuseButtonProps {
  value: string
  onReuse: (value: string) => void
  /** Points the arrow at the input pane: up when stacked, left when side
   * by side. */
  direction: SplitDirection
  className?: string
}

/** Sends an output back into its widget's input, styled to sit next to
 * CopyButton. */
export function ReuseButton({ value, onReuse, direction, className }: ReuseButtonProps) {
  const Icon = direction === 'columns' ? ArrowLeft : ArrowUp
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onReuse(value)}
      disabled={!value}
      title="Use the output as input"
      className={cn('h-auto gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground', className)}
    >
      <Icon className="size-3.5" />
      Reuse
    </Button>
  )
}

import { cn } from '@/lib/utils'

/** Small pill marking a feature that may still change or go away. */
export function ExperimentalBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border border-border px-1.5 text-[10px] leading-4 font-normal text-muted-foreground',
        className,
      )}
    >
      Experimental
    </span>
  )
}

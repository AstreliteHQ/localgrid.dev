import { useState } from 'react'
import { Plus, Share2 } from 'lucide-react'
import { useCommandPaletteStore } from '@/command-palette/useCommandPaletteStore'
import { ThemeToggle } from '@/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ShareModal } from './ShareModal'

/** "Add tools" is the single entry point for finding *and* adding a
 * widget now — the command palette's own rows carry an Add button, so there
 * used to be a separate "Add widget" button/modal here that's now
 * redundant. */
export function DashboardToolbar() {
  const [shareOpen, setShareOpen] = useState(false)
  const setPaletteOpen = useCommandPaletteStore((state) => state.setOpen)

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setPaletteOpen(true)}
        className="text-muted-foreground"
      >
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">Add tools</span>
        <kbd className="ml-1 hidden rounded border border-input px-1 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShareOpen(true)}
      >
        <Share2 className="size-3.5" />
        Share
      </Button>
      <ThemeToggle />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}

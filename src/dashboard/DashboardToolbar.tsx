import type { ReactNode } from 'react'
import { Plus, Settings } from 'lucide-react'
import { useCommandPaletteStore } from '@/command-palette/useCommandPaletteStore'
import { SettingsDialog } from '@/settings/SettingsDialog'
import { ThemeToggle } from '@/theme/ThemeToggle'
import { useSettingsStore } from '@/settings/useSettingsStore'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'

/** "Add tools" is the single entry point for finding *and* adding a
 * widget now — the command palette's own rows carry an Add button, so there
 * used to be a separate "Add widget" button/modal here that's now
 * redundant.
 *
 * `children` (the dashboard-wide actions from AppHeader) share one
 * ButtonGroup with Settings, so on mobile they read as a single compact strip
 * of icons instead of separate padded buttons. Sharing lives in the Settings
 * dialog; the theme switch is both here and in Settings > General. */
export function DashboardToolbar({ children }: { children?: ReactNode }) {
  const setPaletteOpen = useCommandPaletteStore((state) => state.setOpen)
  const openSettings = useSettingsStore((state) => state.openSettings)

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setPaletteOpen(true)}
        className="text-muted-foreground"
        aria-label="Add tools"
      >
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">Add tools</span>
        <kbd className="ml-1 hidden rounded border border-input px-1 text-[10px] sm:inline">⌘K</kbd>
      </Button>
      <ButtonGroup>
        {children}
        <Button type="button" variant="outline" size="sm" onClick={() => openSettings()} aria-label="Settings">
          <Settings className="size-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </ButtonGroup>
      <ThemeToggle />
      <SettingsDialog />
    </div>
  )
}

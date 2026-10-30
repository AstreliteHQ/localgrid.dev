import type { ComponentType } from 'react'
import { Cable, Info, Settings2, Share2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AboutSection } from './AboutSection'
import { ConnectorsSection } from './ConnectorsSection'
import { GeneralSection } from './GeneralSection'
import { ShareSection } from './ShareSection'
import { useSettingsStore, type SettingsSection } from './useSettingsStore'

interface SectionEntry {
  id: SettingsSection
  label: string
  icon: LucideIcon
  component: ComponentType
}

/** Adding a section is one entry here plus its id in `SettingsSection`. */
const SECTIONS: SectionEntry[] = [
  { id: 'general', label: 'General', icon: Settings2, component: GeneralSection },
  { id: 'connectors', label: 'Connectors', icon: Cable, component: ConnectorsSection },
  { id: 'share', label: 'Share', icon: Share2, component: ShareSection },
  { id: 'about', label: 'About', icon: Info, component: AboutSection },
]

/** App settings: a left menu of sections and the active section's panel.
 * Below `sm` the menu becomes a horizontal strip above the panel. */
export function SettingsDialog() {
  const open = useSettingsStore((state) => state.open)
  const section = useSettingsStore((state) => state.section)
  const setSection = useSettingsStore((state) => state.setSection)
  const close = useSettingsStore((state) => state.close)
  const active = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]
  const ActiveSection = active.component

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="flex h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogTitle className="border-b border-border px-4 py-3">Settings</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 gap-1 border-b border-border p-2 sm:w-44 sm:flex-col sm:border-r sm:border-b-0"
          >
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSection(entry.id)}
                aria-current={entry.id === active.id ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  entry.id === active.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <entry.icon className="size-3.5" />
                {entry.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            <ActiveSection />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

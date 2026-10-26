import { useState, type ReactNode } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MAX_DASHBOARDS, useDashboardStore } from '@/dashboard/useDashboardStore'
import { DASHBOARD_STORAGE_KEY } from '@/dashboard/persistence'
import { useThemeStore, type Theme } from '@/theme/useThemeStore'

const THEME_OPTIONS: { label: ReactNode; value: Theme }[] = [
  {
    label: (
      <span className="flex items-center gap-1">
        <Monitor className="size-3.5" /> System
      </span>
    ),
    value: 'system',
  },
  {
    label: (
      <span className="flex items-center gap-1">
        <Sun className="size-3.5" /> Light
      </span>
    ),
    value: 'light',
  },
  {
    label: (
      <span className="flex items-center gap-1">
        <Moon className="size-3.5" /> Dark
      </span>
    ),
    value: 'dark',
  },
]

const STORAGE_PREFIX = 'localgrid.'

const STORAGE_LABELS: Record<string, string> = {
  [DASHBOARD_STORAGE_KEY]: 'Dashboards and widgets',
  'localgrid.theme': 'Theme',
  'localgrid.sidebar-collapsed': 'Sidebar',
}

interface StoredItem {
  key: string
  bytes: number
}

function readStoredItems(): StoredItem[] {
  try {
    const items: StoredItem[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      items.push({ key, bytes: new Blob([window.localStorage.getItem(key) ?? '']).size })
    }
    return items.sort((a, b) => a.key.localeCompare(b.key))
  } catch {
    return []
  }
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

export function GeneralSection() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const configuredCount = useDashboardStore((state) =>
    state.dashboards.reduce((sum, dashboard) => sum + dashboard.widgets.filter((widget) => widget.config).length, 0),
  )
  const resetAllWidgetConfig = useDashboardStore((state) => state.resetAllWidgetConfig)
  const dashboardCount = useDashboardStore((state) => state.dashboards.length)
  const widgetCount = useDashboardStore((state) =>
    state.dashboards.reduce((sum, dashboard) => sum + dashboard.widgets.length, 0),
  )
  // Read on every render: cheap, and the persisted stores write
  // synchronously, so sizes follow the theme and config changes that
  // re-render this section.
  const storedItems = readStoredItems()

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Theme</h3>
        <SegmentedControl value={theme} onChange={setTheme} options={THEME_OPTIONS} className="self-start" />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Workspace</h3>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Dashboards" value={`${dashboardCount} / ${MAX_DASHBOARDS}`} />
          <Stat label="Widgets" value={String(widgetCount)} />
          <Stat label="Widget configuration"value={String(configuredCount)} />
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Data storage</h3>
        <p className="text-xs text-muted-foreground">Stored in this browser only.</p>
        <ul className="divide-y divide-border rounded-md border border-border text-xs">
          {storedItems.length === 0 && <li className="px-3 py-2 text-muted-foreground">No data stored.</li>}
          {storedItems.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block text-foreground">{STORAGE_LABELS[item.key] ?? item.key}</span>
                <code className="font-mono text-muted-foreground">{item.key}</code>
              </span>
              <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{formatBytes(item.bytes)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            label="Reset widget configuration"
            title="Reset widget configuration?"
            description="Configured widgets go back to their defaults."
            confirmLabel="Reset"
            disabled={configuredCount === 0}
            onConfirm={resetAllWidgetConfig}
          />
          <ConfirmButton
            label="Delete all data"
            title="Delete all data?"
            description="Removes all dashboards and settings from this browser. This can't be undone."
            confirmLabel="Delete"
            destructive
            onConfirm={eraseLocalData}
          />
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  )
}

function eraseLocalData() {
  for (const { key } of readStoredItems()) window.localStorage.removeItem(key)
  window.location.reload()
}

interface ConfirmButtonProps {
  label: string
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  destructive?: boolean
}

function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  destructive,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={destructive ? 'destructive' : 'outline'}
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{description}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              size="sm"
              onClick={() => {
                onConfirm()
                setOpen(false)
              }}
              // Same solid style as AppHeader's "Clean" confirm.
              className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

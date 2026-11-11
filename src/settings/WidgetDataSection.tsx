import { useId, useMemo, useState } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { Button } from '@/components/ui/button'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { cn } from '@/lib/utils'
import { getWidgetDefinition } from '@/widgets/registry'
import { useWidgetDataSettings } from '@/widgets/useWidgetDataSettings'
import { listWidgetData, type WidgetDataEntry } from '@/widgets/widgetData'
import { ConfirmButton } from './ConfirmButton'
import { WidgetDataBanner } from './WidgetDataBanner'

const ANIMATION_OPTIONS: { label: string; value: 'always' | 'off' }[] = [
  { label: 'Always', value: 'always' },
  { label: 'Off', value: 'off' },
]

/** Turns widget data on or off and lists every widget holding some. */
export function WidgetDataSection() {
  const enabled = useWidgetDataSettings((state) => state.enabled)
  const setEnabled = useWidgetDataSettings((state) => state.setEnabled)
  const animation = useWidgetDataSettings((state) => state.animation)
  const setAnimation = useWidgetDataSettings((state) => state.setAnimation)
  const dashboards = useDashboardStore((state) => state.dashboards)
  const resetAllWidgetData = useDashboardStore((state) => state.resetAllWidgetData)
  const entries = useMemo(() => listWidgetData(dashboards), [dashboards])
  const enabledId = useId()

  return (
    <div className="flex flex-col gap-6">
      <WidgetDataBanner />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Widget data</h3>
        <label htmlFor={enabledId} className="flex items-start gap-2 text-sm">
          <input
            id={enabledId}
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Enable widget data
            <span className="block text-xs text-muted-foreground">
              On by default. When off, widgets start from their defaults and save nothing new. Saved data is kept but
              paused.
            </span>
          </span>
        </label>
      </section>

      <fieldset disabled={!enabled} className={cn('flex flex-col gap-2', !enabled && 'opacity-50')}>
        <h3 className="text-sm font-medium text-foreground">Icon animation</h3>
        <SegmentedControl
          value={animation ? 'always' : 'off'}
          onChange={(value) => setAnimation(value === 'always')}
          options={ANIMATION_OPTIONS}
          className="self-start"
        />
        <p className="text-xs text-muted-foreground">
          The ring around a widget's data icon. Always off when the system asks for reduced motion.
        </p>
      </fieldset>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Saved data</h3>
        <p className="text-xs text-muted-foreground">
          {entries.length === 1 ? '1 widget' : `${entries.length} widgets`} with data saved in this browser.
          {!enabled && entries.length > 0 && ' Paused until widget data is enabled again.'}
        </p>
        {entries.length > 0 && (
          <ul
            className={cn('divide-y divide-border rounded-md border border-border text-xs', !enabled && 'opacity-60')}
          >
            {entries.map((entry) => (
              <WidgetDataRow key={entry.instance.instanceId} entry={entry} showDashboard={dashboards.length > 1} />
            ))}
          </ul>
        )}
        <div>
          <ConfirmButton
            label="Remove all widget data"
            title="Remove all widget data?"
            description="Widgets with saved data go back to their defaults."
            confirmLabel="Remove"
            disabled={entries.length === 0}
            onConfirm={resetAllWidgetData}
          />
        </div>
      </section>
    </div>
  )
}

function WidgetDataRow({ entry, showDashboard }: { entry: WidgetDataEntry; showDashboard: boolean }) {
  const [open, setOpen] = useState(false)
  const resetWidgetData = useDashboardStore((state) => state.resetWidgetData)
  const panelId = useId()
  const { instance, dashboardName } = entry
  const definition = getWidgetDefinition(instance.widgetId)
  const name = definition?.name ?? instance.widgetId
  const Icon = definition?.icon
  const fieldCount = Object.keys(instance.data ?? {}).length

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-foreground">
          {name}
          {showDashboard && <span className="ml-1.5 text-muted-foreground">on {dashboardName}</span>}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {fieldCount === 1 ? '1 field' : `${fieldCount} fields`}
        </span>
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2 px-3 pb-3">
          <div className="max-h-64 overflow-y-auto rounded bg-muted p-1">
            <DataTree
              root={buildJsonTree(instance.data)}
              label={`${name} data`}
              toolbar={false}
              statusBar={false}
              scroll={false}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => resetWidgetData(instance.instanceId)}
            className="self-start text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            Reset {name} data
          </Button>
        </div>
      )}
    </li>
  )
}

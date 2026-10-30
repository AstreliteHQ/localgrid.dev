import { useId } from 'react'
import { RotateCcw } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { DEFAULT_CONNECTOR_COLORS } from '@/connectors/connectionGraph'
import { useConnectionStore } from '@/connectors/useConnectionStore'
import { useConnectorSettings, type ConveyorAnimation } from '@/connectors/useConnectorSettings'
import { cn } from '@/lib/utils'
import { ConfirmButton } from './ConfirmButton'

const ANIMATION_OPTIONS: { label: string; value: ConveyorAnimation }[] = [
  { label: 'On hover', value: 'hover' },
  { label: 'Always', value: 'always' },
  { label: 'Off', value: 'off' },
]

/** Turns widget connectors on or off and tunes how wires look. */
export function ConnectorsSection() {
  const enabled = useConnectorSettings((state) => state.enabled)
  const animation = useConnectorSettings((state) => state.animation)
  const showSourceLabels = useConnectorSettings((state) => state.showSourceLabels)
  const colors = useConnectorSettings((state) => state.colors)
  const { setEnabled, setAnimation, setShowSourceLabels, setColor, resetColors } = useConnectorSettings.getState()
  const connectionCount = useConnectionStore((state) => state.connections.length)
  const enabledId = useId()
  const labelsId = useId()
  const isDefaultPalette = colors.every((color, index) => color === DEFAULT_CONNECTOR_COLORS[index])

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Connectors</h3>
        <p className="text-xs text-muted-foreground">
          Drag from a widget's OUT tab onto another widget to send its output there.
        </p>
        <label htmlFor={enabledId} className="flex items-start gap-2 text-sm">
          <input
            id={enabledId}
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Enable connectors
            <span className="block text-xs text-muted-foreground">
              When off, IN / OUT tabs and wires are hidden. Connections are kept but paused.
            </span>
          </span>
        </label>
      </section>

      <fieldset disabled={!enabled} className={cn('flex flex-col gap-6', !enabled && 'opacity-50')}>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Conveyor animation</h3>
          <SegmentedControl
            value={animation}
            onChange={setAnimation}
            options={ANIMATION_OPTIONS}
            className="self-start"
          />
          <p className="text-xs text-muted-foreground">Always off when the system asks for reduced motion.</p>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Input fields</h3>
          <label htmlFor={labelsId} className="flex items-start gap-2 text-sm">
            <input
              id={labelsId}
              type="checkbox"
              checked={showSourceLabels}
              onChange={(event) => setShowSourceLabels(event.target.checked)}
              className="mt-1 accent-primary"
            />
            <span>
              Show the source on connected fields
              <span className="block text-xs text-muted-foreground">
                A label like "← Base64". Off shows a colored dot only.
              </span>
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Colors</h3>
          <p className="text-xs text-muted-foreground">Each source widget gets one of these colors.</p>
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((color, index) => (
              <label
                key={index}
                style={{ backgroundColor: color }}
                className="relative size-7 cursor-pointer rounded-full border border-border shadow-sm focus-within:ring-2 focus-within:ring-ring"
              >
                <input
                  type="color"
                  value={color}
                  aria-label={`Connector color ${index + 1}`}
                  onChange={(event) => setColor(index, event.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isDefaultPalette}
              onClick={resetColors}
              className="text-muted-foreground"
            >
              <RotateCcw className="size-3.5" />
              Reset colors
            </Button>
          </div>
        </section>
      </fieldset>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Connections</h3>
        <p className="text-xs text-muted-foreground">
          {connectionCount === 1 ? '1 connection' : `${connectionCount} connections`} saved in this browser.
        </p>
        <div>
          <ConfirmButton
            label="Remove all connections"
            title="Remove all connections?"
            description="Every wire between widgets is removed. Widget content stays as it is."
            confirmLabel="Remove"
            disabled={connectionCount === 0}
            onConfirm={() => useConnectionStore.getState().setConnections([])}
          />
        </div>
      </section>
    </div>
  )
}

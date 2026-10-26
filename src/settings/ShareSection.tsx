import { useId, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { AlertTriangle, Check, Copy, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toWire, type WireWorkspace } from '@/dashboard/layoutCodec'
import { buildShareUrl } from '@/dashboard/shareUrl'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { getWidgetDefinition } from '@/widgets/registry'

type CopyStatus = 'idle' | 'copied' | 'failed'

// Conservative character-count guard, well under a QR code's real capacity
// (~2953 bytes at the lowest error-correction level for byte data). Past it,
// offer copy-link only rather than a QR code that may not scan reliably.
const QR_LENGTH_LIMIT = 1500

/** Lets the user pick what a share link carries (address only, plus layout,
 * plus widget configuration) and shows that data in full before copying. */
export function ShareSection() {
  const dashboards = useDashboardStore((state) => state.dashboards)
  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId)
  const [includeLayout, setIncludeLayout] = useState(true)
  const [includeConfig, setIncludeConfig] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const qrContainerRef = useRef<HTMLDivElement>(null)
  const layoutId = useId()
  const configId = useId()

  const shareConfig = includeLayout && includeConfig
  const shareUrl = useMemo(
    () => buildShareUrl(dashboards, activeDashboardId, { includeLayout, includeConfig: shareConfig }),
    [dashboards, activeDashboardId, includeLayout, shareConfig],
  )
  // Same function the encoder uses, so the preview is exactly what's sent.
  const wire = useMemo(
    () => (includeLayout ? toWire(dashboards, activeDashboardId, { includeConfig: shareConfig }) : null),
    [dashboards, activeDashboardId, includeLayout, shareConfig],
  )
  const qrEligible = shareUrl.length <= QR_LENGTH_LIMIT

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    setTimeout(() => setCopyStatus('idle'), 1200)
  }

  const handleDownload = () => {
    const canvas = qrContainerRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'localgrid-dashboard-qr.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">What to share</h3>
        <p className="text-xs text-muted-foreground">Widget content is never shared.</p>
        <label htmlFor={layoutId} className="flex items-start gap-2 text-sm">
          <input
            id={layoutId}
            type="checkbox"
            checked={includeLayout}
            onChange={(event) => setIncludeLayout(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Include layout
            <span className="block text-xs text-muted-foreground">Dashboards and widget positions.</span>
          </span>
        </label>
        <label htmlFor={configId} className={cn('flex items-start gap-2 text-sm', !includeLayout && 'opacity-50')}>
          <input
            id={configId}
            type="checkbox"
            checked={shareConfig}
            disabled={!includeLayout}
            onChange={(event) => setIncludeConfig(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Include widget configuration
            <span className="block text-xs text-muted-foreground">
              {includeLayout ? 'Saved widget settings. May contain text you entered.' : 'Requires layout.'}
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Preview</h3>
        <SharePreview wire={wire} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={shareUrl}
            aria-label="Share link"
            onFocus={(event) => event.target.select()}
            className="min-w-0 flex-1 truncate font-mono text-xs"
          />
          <Button type="button" size="sm" onClick={handleCopy} aria-live="polite" className="shrink-0">
            {copyStatus === 'copied' ? (
              <Check className="size-3.5" />
            ) : copyStatus === 'failed' ? (
              <AlertTriangle className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
          </Button>
        </div>

        {qrEligible ? (
          <div className="flex flex-col items-center gap-2">
            {/* Always white regardless of theme: a dark QR background hurts
             * scan contrast. */}
            <div ref={qrContainerRef} className="rounded-lg bg-white p-3">
              <QRCodeCanvas value={shareUrl} size={180} marginSize={2} />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={handleDownload} className="text-muted-foreground">
              <Download className="size-3.5" />
              Download QR
            </Button>
          </div>
        ) : (
          // Amber has no semantic token; kept literal as in the old share modal.
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            Too long for a QR code. Copy the link instead.
          </p>
        )}
      </section>
    </div>
  )
}

function SharePreview({ wire }: { wire: WireWorkspace | null }) {
  if (!wire) {
    return (
      <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">Link to localgrid only.</p>
    )
  }
  return (
    <div className="flex max-h-52 flex-col gap-3 overflow-y-auto rounded-md border border-border p-3 text-xs">
      {wire.d.map((dashboard) => (
        <div key={dashboard.id} className="flex flex-col gap-1">
          <div className="font-medium text-foreground">
            {dashboard.n}
            {dashboard.id === wire.a && <span className="ml-1 font-normal text-muted-foreground">(active)</span>}
          </div>
          {dashboard.ws.length === 0 && <div className="pl-3 text-muted-foreground">No widgets</div>}
          <ul className="flex flex-col gap-1 pl-3">
            {dashboard.ws.map((widget, index) => (
              <li key={index}>
                <span className="text-foreground">{getWidgetDefinition(widget.wid)?.name ?? widget.wid}</span>
                <span className="ml-2 font-mono text-muted-foreground">
                  {widget.w}×{widget.h} at ({widget.x}, {widget.y})
                </span>
                {widget.c && (
                  <div className="mt-1 rounded bg-muted p-1">
                    <DataTree
                      root={buildJsonTree(widget.c)}
                      label={`${getWidgetDefinition(widget.wid)?.name ?? widget.wid} configuration`}
                      toolbar={false}
                      statusBar={false}
                      scroll={false}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

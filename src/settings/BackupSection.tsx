import { useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorMessage } from '@/components/ErrorMessage'
import type { DecodeResult } from '@/dashboard/layoutCodec'
import { ShareLoadPrompt } from '@/dashboard/ShareLoadPrompt'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import {
  buildWorkspaceFile,
  MAX_WORKSPACE_FILE_BYTES,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  workspaceFileName,
} from '@/dashboard/workspaceFile'
import { useFlowStore } from '@/flow/useFlowStore'

type LoadedFile = Extract<DecodeResult, { ok: true }>

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revoked on the next task, once the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Downloads every dashboard as a `.json` file (layout, widget data and
 * flow links, the same data a share link can carry) and loads one back
 * after a confirm. */
export function BackupSection() {
  const dashboards = useDashboardStore((state) => state.dashboards)
  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId)
  const importWorkspace = useDashboardStore((state) => state.importWorkspace)
  const links = useFlowStore((state) => state.links)
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Counts file selections, so a slow read that finishes after a newer
  // selection is ignored instead of replacing its result.
  const latestSelection = useRef(0)

  const widgetCount = dashboards.reduce((sum, dashboard) => sum + dashboard.widgets.length, 0)
  const dataCount = dashboards.reduce(
    (sum, dashboard) => sum + dashboard.widgets.filter((widget) => widget.data).length,
    0,
  )
  const handleExport = () => {
    const file = buildWorkspaceFile(dashboards, activeDashboardId, { links })
    const text = serializeWorkspaceFile(file)
    // Refused rather than downloaded, since import would refuse it too.
    if (new Blob([text]).size > MAX_WORKSPACE_FILE_BYTES) {
      setStatus(null)
      setExportError('This export is too large to load back.')
      return
    }
    setExportError(null)
    downloadText(text, workspaceFileName())
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ''
    if (!file) return
    const selection = ++latestSelection.current
    setStatus(null)
    if (file.size > MAX_WORKSPACE_FILE_BYTES) {
      setError('This file is too large to be a localgrid export.')
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      if (selection === latestSelection.current) setError('Could not read this file.')
      return
    }
    if (selection !== latestSelection.current) return
    const result = parseWorkspaceFile(text)
    if (result.ok) {
      setError(null)
      setLoaded(result)
    } else {
      setError(result.error)
    }
  }

  const handleAccept = () => {
    if (!loaded) return
    const { workspace } = loaded
    importWorkspace(workspace.dashboards, workspace.activeDashboardId, workspace.links)
    setLoaded(null)
    setStatus(`Loaded ${plural(workspace.dashboards.length, 'dashboard')}.`)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Export</h3>
        <p className="text-xs text-muted-foreground">
          Downloads a .json file with every dashboard, widget positions, saved widget data and flow links. Use it as a
          backup or to move your dashboards to another browser.
        </p>
        <p className="text-xs text-muted-foreground">Widget content is never exported, the same as with Share.</p>
        <p className="text-xs text-muted-foreground">
          {plural(dashboards.length, 'dashboard')}, {plural(widgetCount, 'widget')}, {dataCount} with widget data,{' '}
          {plural(links.length, 'link')}.
        </p>
        <Button type="button" size="sm" onClick={handleExport} className="self-start">
          <Download className="size-3.5" />
          Download JSON
        </Button>
        {exportError && <ErrorMessage>{exportError}</ErrorMessage>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Import</h3>
        <p className="text-xs text-muted-foreground">
          Loads a file exported from localgrid. It replaces all of your current dashboards, after you confirm.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          className="hidden"
          aria-label="Workspace file"
          data-testid="workspace-file-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="self-start"
        >
          <Upload className="size-3.5" />
          Choose file…
        </Button>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {status && (
          <p role="status" className="text-xs text-success">
            {status}
          </p>
        )}
      </section>

      {loaded && (
        <ShareLoadPrompt
          workspace={loaded.workspace}
          source="file"
          onAccept={handleAccept}
          onDismiss={() => setLoaded(null)}
        />
      )}
    </div>
  )
}

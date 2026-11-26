import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDashboardStore } from '@/dashboard/useDashboardStore'
import { buildWorkspaceFile, serializeWorkspaceFile } from '@/dashboard/workspaceFile'
import { useFlowStore } from '@/flow/useFlowStore'
import { useWidgetStateStore } from '@/widgets/useWidgetState'
import { BackupSection } from './BackupSection'

const DASHBOARDS = [
  {
    id: 'dash',
    name: 'Team',
    widgets: [
      {
        instanceId: 'clock',
        widgetId: 'world-clock',
        x: 0,
        y: 0,
        w: 5,
        h: 4,
        data: { selectedIds: ['paris', 'tokyo'] },
      },
      { instanceId: 'b64', widgetId: 'base64', x: 5, y: 0, w: 3, h: 3 },
    ],
  },
]

let exported: Blob[] = []

beforeEach(() => {
  exported = []
  useDashboardStore.setState({ dashboards: DASHBOARDS, activeDashboardId: 'dash' })
  useFlowStore.getState().setLinks([])
  useWidgetStateStore.setState({ values: { 'b64:input': 'typed text' } })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    exported.push(blob as Blob)
    return 'blob:export'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function exportedJson() {
  expect(exported).toHaveLength(1)
  return JSON.parse(await exported[0].text())
}

describe('BackupSection', () => {
  it('exports layout and widget data without widget content by default', async () => {
    const user = userEvent.setup()
    render(<BackupSection />)

    await user.click(screen.getByRole('button', { name: /download json/i }))

    const file = await exportedJson()
    expect(file.format).toBe('localgrid-workspace')
    expect(file.workspace.d[0].ws[0].c).toEqual({ selectedIds: ['paris', 'tokyo'] })
    expect(JSON.stringify(file)).not.toContain('typed text')
  })

  it('exports widget content when asked', async () => {
    const user = userEvent.setup()
    render(<BackupSection />)
    expect(screen.getByText(/right now \(1 widget\)/i)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /include widget content/i }))
    await user.click(screen.getByRole('button', { name: /download json/i }))

    const file = await exportedJson()
    expect(file.workspace.d[0].ws[1].s).toEqual({ input: 'typed text' })
  })

  it('imports a file after confirming, with its widget content', async () => {
    const user = userEvent.setup()
    const text = serializeWorkspaceFile(
      buildWorkspaceFile(
        [
          {
            id: 'other',
            name: 'From another browser',
            widgets: [{ instanceId: 'x', widgetId: 'base64', x: 0, y: 0, w: 3, h: 3 }],
          },
        ],
        'other',
        { stateValues: { 'x:input': 'restored' } },
      ),
    )
    render(<BackupSection />)

    await user.upload(screen.getByTestId('workspace-file-input'), new File([text], 'backup.json'))

    expect(screen.getByText(/load workspace from file/i)).toBeInTheDocument()
    expect(screen.getByText(/restores the content of 1 widget/i)).toBeInTheDocument()
    expect(useDashboardStore.getState().activeDashboardId).toBe('dash')

    await user.click(screen.getByRole('button', { name: /load file/i }))

    const { dashboards, activeDashboardId } = useDashboardStore.getState()
    expect(activeDashboardId).toBe('other')
    expect(dashboards.map((dashboard) => dashboard.name)).toEqual(['From another browser'])
    const instanceId = dashboards[0].widgets[0].instanceId
    expect(useWidgetStateStore.getState().values[`${instanceId}:input`]).toBe('restored')
    expect(useWidgetStateStore.getState().values['b64:input']).toBeUndefined()
    expect(screen.getByRole('status')).toHaveTextContent('Loaded 1 dashboard.')
  })

  it('keeps the current dashboards when the import is dismissed', async () => {
    const user = userEvent.setup()
    const text = serializeWorkspaceFile(buildWorkspaceFile([{ id: 'other', name: 'Other', widgets: [] }], 'other'))
    render(<BackupSection />)

    await user.upload(screen.getByTestId('workspace-file-input'), new File([text], 'backup.json'))
    await user.click(screen.getByRole('button', { name: /keep my dashboards/i }))

    expect(useDashboardStore.getState().dashboards).toBe(DASHBOARDS)
  })

  it('shows why a file was refused', async () => {
    const user = userEvent.setup()
    render(<BackupSection />)

    await user.upload(screen.getByTestId('workspace-file-input'), new File(['{"nope":true}'], 'other.json'))

    expect(screen.getByText("This file isn't a localgrid export.")).toBeInTheDocument()
    expect(useDashboardStore.getState().dashboards).toBe(DASHBOARDS)
  })
})

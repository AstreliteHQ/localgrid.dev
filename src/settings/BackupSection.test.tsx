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
  it('exports layout and widget data but never widget state', async () => {
    const user = userEvent.setup()
    render(<BackupSection />)

    await user.click(screen.getByRole('button', { name: /download json/i }))

    const file = await exportedJson()
    expect(file.format).toBe('localgrid-workspace')
    expect(file.workspace.d[0].ws[0].c).toEqual({ selectedIds: ['paris', 'tokyo'] })
    expect(JSON.stringify(file)).not.toContain('typed text')
  })

  it('imports a file after confirming', async () => {
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
      ),
    )
    render(<BackupSection />)

    await user.upload(screen.getByTestId('workspace-file-input'), new File([text], 'backup.json'))

    expect(screen.getByText(/load workspace from file/i)).toBeInTheDocument()
    expect(useDashboardStore.getState().activeDashboardId).toBe('dash')

    await user.click(screen.getByRole('button', { name: /load file/i }))

    const { dashboards, activeDashboardId } = useDashboardStore.getState()
    expect(activeDashboardId).toBe('other')
    expect(dashboards.map((dashboard) => dashboard.name)).toEqual(['From another browser'])
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

describe('BackupSection edge cases', () => {
  it('only acts on the most recent file selection', async () => {
    const user = userEvent.setup()
    let releaseSlow: (text: string) => void = () => {}
    const slow = new File(['{}'], 'slow.json')
    slow.text = () => new Promise((resolve) => (releaseSlow = resolve))
    const fast = new File(['{"nope":true}'], 'fast.json')
    render(<BackupSection />)
    const input = screen.getByTestId('workspace-file-input')

    await user.upload(input, slow)
    await user.upload(input, fast)
    releaseSlow(serializeWorkspaceFile(buildWorkspaceFile([{ id: 'x', name: 'Slow', widgets: [] }], 'x')))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByText("This file isn't a localgrid export.")).toBeInTheDocument()
    expect(screen.queryByText(/load workspace from file/i)).not.toBeInTheDocument()
  })

  it('refuses an export too large to load back', async () => {
    const user = userEvent.setup()
    const notes = 'x'.repeat(21 * 1024 * 1024)
    // Bigger than jsdom's localStorage quota, so keep the store from persisting it.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    useDashboardStore.setState({
      dashboards: [
        {
          id: 'dash',
          name: 'Team',
          widgets: [
            {
              instanceId: 'pad',
              widgetId: 'scratchpad',
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              data: { remember: true, savedDoc: notes },
            },
          ],
        },
      ],
      activeDashboardId: 'dash',
    })
    render(<BackupSection />)

    await user.click(screen.getByRole('button', { name: /download json/i }))

    expect(exported).toHaveLength(0)
    expect(screen.getByText(/too large to load back/i)).toBeInTheDocument()
  })
})

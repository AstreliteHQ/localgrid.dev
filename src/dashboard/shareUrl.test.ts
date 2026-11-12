import { describe, expect, it } from 'vitest'
import type { Dashboard } from '@/types/layout'
import { decodeWorkspace } from './layoutCodec'
import { buildShareUrl } from './shareUrl'

const DASHBOARDS: Dashboard[] = [
  {
    id: 'dash-a',
    name: 'Dash A',
    widgets: [{ instanceId: 'a', widgetId: 'uuid-generator', x: 0, y: 0, w: 2, h: 2 }],
  },
  { id: 'dash-b', name: 'Dash B', widgets: [] },
]

/** Strips `instanceId` — the wire format never carries it (see
 * layoutCodec.ts), so a round-tripped workspace gets fresh ones and can
 * only be compared on everything else. */
function withoutInstanceIds(dashboards: Dashboard[]) {
  return dashboards.map((dashboard) => ({
    ...dashboard,
    widgets: dashboard.widgets.map(({ instanceId: _instanceId, ...rest }) => rest),
  }))
}

describe('buildShareUrl', () => {
  it('puts the workspace in the URL fragment, not a query param', () => {
    const shareUrl = buildShareUrl(DASHBOARDS, 'dash-a')
    const url = new URL(shareUrl)

    expect(url.search).toBe('')
    expect(url.hash).toMatch(/^#layout=/)
  })

  it('round-trips through the fragment back to the original dashboards and active id', () => {
    const url = new URL(buildShareUrl(DASHBOARDS, 'dash-b'))
    const encoded = new URLSearchParams(url.hash.slice(1)).get('layout')

    expect(encoded).toBeTruthy()
    const result = decodeWorkspace(encoded ?? '')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(withoutInstanceIds(result.workspace.dashboards)).toEqual(withoutInstanceIds(DASHBOARDS))
      expect(result.workspace.activeDashboardId).toBe('dash-b')
    }
  })
})

describe('buildShareUrl: share options', () => {
  const WITH_DATA: Dashboard[] = [
    {
      id: 'dash-a',
      name: 'Dash A',
      widgets: [{ instanceId: 'a', widgetId: 'world-clock', x: 0, y: 0, w: 5, h: 4, data: { selectedIds: ['paris'] } }],
    },
  ]

  function decodedWidgets(shareUrl: string) {
    const encoded = new URLSearchParams(new URL(shareUrl).hash.slice(1)).get('layout') ?? ''
    const result = decodeWorkspace(encoded)
    return result.ok ? result.workspace.dashboards[0].widgets : []
  }

  it('returns the bare app URL when layout is left out', () => {
    const url = new URL(buildShareUrl(WITH_DATA, 'dash-a', { includeLayout: false, includeData: true }))

    expect(url.hash).toBe('')
    expect(url.search).toBe('')
  })

  it('leaves widget data out unless asked', () => {
    const [widget] = decodedWidgets(buildShareUrl(WITH_DATA, 'dash-a', { includeLayout: true, includeData: false }))

    expect(widget).not.toHaveProperty('data')
  })

  it('carries widget data when asked', () => {
    const [widget] = decodedWidgets(buildShareUrl(WITH_DATA, 'dash-a', { includeLayout: true, includeData: true }))

    expect(widget.data).toEqual({ selectedIds: ['paris'] })
  })
})

import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import type { Dashboard, DashboardWidgetInstance } from '@/types/layout'
import { decodeWorkspace, encodeWorkspace } from './layoutCodec'

const DASHBOARDS: Dashboard[] = [
  {
    id: 'dash-a',
    name: 'Dash A',
    widgets: [
      { instanceId: 'a', widgetId: 'uuid-generator', x: 0, y: 0, w: 2, h: 2 },
      { instanceId: 'b', widgetId: 'json-formatter', x: 2, y: 0, w: 4, h: 4 },
    ],
  },
  {
    id: 'dash-b',
    name: 'Dash B',
    widgets: [{ instanceId: 'c', widgetId: 'base64', x: 0, y: 0, w: 2, h: 2 }],
  },
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

describe('layoutCodec — workspace (multi-dashboard)', () => {
  it('round-trips a workspace through encode/decode, minting a fresh instanceId per widget', () => {
    const result = decodeWorkspace(encodeWorkspace(DASHBOARDS, 'dash-a'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(withoutInstanceIds(result.workspace.dashboards)).toEqual(withoutInstanceIds(DASHBOARDS))
    expect(result.workspace.activeDashboardId).toBe('dash-a')
    expect(result.workspace.version).toBe(2)

    const instanceIds = result.workspace.dashboards.flatMap((d) => d.widgets.map((w) => w.instanceId))
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
    expect(instanceIds).not.toContain('a')
  })

  it('silently drops instances referencing an unknown widget id', () => {
    const withUnknown: Dashboard[] = [
      {
        id: 'dash-a',
        name: 'Dash A',
        widgets: [
          ...DASHBOARDS[0].widgets,
          { instanceId: 'ghost', widgetId: 'not-a-real-widget', x: 0, y: 4, w: 2, h: 2 },
        ],
      },
    ]
    const result = decodeWorkspace(encodeWorkspace(withUnknown, 'dash-a'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.dashboards[0].widgets.map((w) => w.widgetId)).toEqual([
        'uuid-generator',
        'json-formatter',
      ])
    }
  })

  it('falls back to the first dashboard when activeDashboardId does not match any dashboard', () => {
    const result = decodeWorkspace(encodeWorkspace(DASHBOARDS, 'no-such-id'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.activeDashboardId).toBe(DASHBOARDS[0].id)
    }
  })

  it('rejects a workspace with no dashboards at all', () => {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, d: [], a: 'none' }))
    const result = decodeWorkspace(encoded)
    expect(result.ok).toBe(false)
  })

  it('rejects a payload with the wrong schema shape', () => {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, d: 'not-an-array', a: 'x' }))
    const result = decodeWorkspace(encoded)
    expect(result.ok).toBe(false)
  })

  it('rejects valid JSON that is not workspace-shaped at all', () => {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ hello: 'world' }))
    const result = decodeWorkspace(encoded)
    expect(result.ok).toBe(false)
  })

  it('rejects undecompressable garbage without throwing', () => {
    const result = decodeWorkspace('%%%not-a-valid-lz-string%%%')
    expect(result.ok).toBe(false)
  })

  it('rejects a payload the LZ-String library itself throws on (e.g. "z")', () => {
    expect(decodeWorkspace('z')).toEqual({ ok: false, error: 'Could not read this share link.' })
  })

  it('produces a meaningfully smaller payload than the old verbose (instanceId-carrying) shape would', () => {
    const encoded = encodeWorkspace(DASHBOARDS, 'dash-a')
    const verbosePayload = JSON.stringify({
      version: 2,
      dashboards: DASHBOARDS,
      activeDashboardId: 'dash-a',
    })
    const verboseEncoded = LZString.compressToEncodedURIComponent(verbosePayload)
    expect(encoded.length).toBeLessThan(verboseEncoded.length)
  })
})

describe('layoutCodec — backward compatibility with pre-tabs share links', () => {
  const LEGACY_WIDGETS: DashboardWidgetInstance[] = [
    { instanceId: 'legacy-a', widgetId: 'uuid-generator', x: 0, y: 0, w: 2, h: 2 },
  ]

  it('decodes an old single-dashboard (version 1) payload into a one-dashboard workspace', () => {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ version: 1, widgets: LEGACY_WIDGETS }))

    const result = decodeWorkspace(encoded)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.dashboards).toHaveLength(1)
      expect(result.workspace.dashboards[0].widgets).toEqual(LEGACY_WIDGETS)
      expect(result.workspace.activeDashboardId).toBe(result.workspace.dashboards[0].id)
    }
  })
})

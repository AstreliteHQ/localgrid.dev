import { describe, expect, it } from 'vitest'
import type { Dashboard } from '@/types/layout'
import { encodeWorkspace, decodeWorkspace } from './layoutCodec'
import {
  buildWorkspaceFile,
  collectWidgetContent,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  workspaceFileName,
  WORKSPACE_FILE_FORMAT,
} from './workspaceFile'

const DASHBOARDS: Dashboard[] = [
  {
    id: 'dash-a',
    name: 'Dev',
    widgets: [
      { instanceId: 'b64', widgetId: 'base64', x: 0, y: 0, w: 3, h: 3 },
      { instanceId: 'json', widgetId: 'json-formatter', x: 3, y: 0, w: 5, h: 4 },
    ],
  },
  {
    id: 'dash-b',
    name: 'Team',
    widgets: [
      {
        instanceId: 'clock',
        widgetId: 'world-clock',
        x: 0,
        y: 0,
        w: 3,
        h: 7,
        data: { selectedIds: ['paris', 'tokyo'] },
      },
    ],
  },
]

const LINKS = [{ from: 'b64', to: 'json', input: 'input' }]

function roundTrip(file: ReturnType<typeof buildWorkspaceFile>) {
  return parseWorkspaceFile(serializeWorkspaceFile(file))
}

describe('workspaceFile', () => {
  it('wraps the share wire format with layout, widget data and links', () => {
    const file = buildWorkspaceFile(DASHBOARDS, 'dash-b', { links: LINKS, now: new Date('2026-11-26T10:00:00Z') })

    expect(file.format).toBe(WORKSPACE_FILE_FORMAT)
    expect(file.version).toBe(1)
    expect(file.exportedAt).toBe('2026-11-26T10:00:00.000Z')
    expect(file.workspace.v).toBe(1)
    expect(file.workspace.a).toBe('dash-b')
    expect(file.workspace.d[0].l).toEqual([[0, 1, 'input']])
    expect(file.workspace.d[1].ws[0].c).toEqual({ selectedIds: ['paris', 'tokyo'] })
    expect(file.workspace.d[0].ws[0].s).toBeUndefined()
  })

  it('round-trips layout, widget data, links and the active dashboard', () => {
    const result = roundTrip(buildWorkspaceFile(DASHBOARDS, 'dash-b', { links: LINKS }))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { workspace } = result
    expect(workspace.activeDashboardId).toBe('dash-b')
    expect(workspace.dashboards.map((dashboard) => dashboard.name)).toEqual(['Dev', 'Team'])
    expect(workspace.dashboards[1].widgets[0].data).toEqual({ selectedIds: ['paris', 'tokyo'] })
    const [b64, json] = workspace.dashboards[0].widgets
    expect(workspace.links).toEqual([{ from: b64.instanceId, to: json.instanceId, input: 'input' }])
    expect(result.content).toBeUndefined()
  })

  it('carries widget content only when state values are given', () => {
    const stateValues = {
      'b64:input': 'hello',
      'b64:mode': 'encode',
      'json:input': '{"a":1}',
      'overlay:input': 'not on a dashboard',
    }
    const file = buildWorkspaceFile(DASHBOARDS, 'dash-a', { stateValues })
    expect(file.workspace.d[0].ws[0].s).toEqual({ input: 'hello', mode: 'encode' })
    expect(JSON.stringify(file)).not.toContain('not on a dashboard')

    const result = roundTrip(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [b64, json] = result.workspace.dashboards[0].widgets
    expect(result.content).toEqual({
      [b64.instanceId]: { input: 'hello', mode: 'encode' },
      [json.instanceId]: { input: '{"a":1}' },
    })
  })

  it('leaves out content JSON cannot represent', () => {
    const content = collectWidgetContent(
      {
        'b64:file': new Blob(['x']),
        'b64:map': new Map(),
        'b64:size': Number.NaN,
        'b64:options': { trim: true, nested: [1, 'two', null] },
        'b64:list': [1, new Blob(['y'])],
        'b64:input': null,
      },
      ['b64'],
    )
    expect(content).toEqual({ b64: { options: { trim: true, nested: [1, 'two', null] } } })
  })

  it('never reads widget content from a share link', () => {
    const encoded = encodeWorkspace(DASHBOARDS, 'dash-a', { content: () => ({ input: 'secret' }) })
    const result = decodeWorkspace(encoded)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toBeUndefined()
  })

  it('drops unknown widgets, their content, and bad widget data', () => {
    const file = buildWorkspaceFile(
      [
        {
          id: 'dash',
          name: 'Dash',
          widgets: [
            { instanceId: 'ghost', widgetId: 'not-a-widget', x: 0, y: 0, w: 2, h: 2 },
            { instanceId: 'clock', widgetId: 'world-clock', x: 0, y: 2, w: 3, h: 7, data: { selectedIds: 'paris' } },
          ],
        },
      ],
      'dash',
      { stateValues: { 'ghost:input': 'x' } },
    )
    const result = roundTrip(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.workspace.dashboards[0].widgets).toHaveLength(1)
    expect(result.workspace.dashboards[0].widgets[0].data).toBeUndefined()
    expect(result.content).toBeUndefined()
  })

  it('rejects files that are not localgrid exports', () => {
    expect(parseWorkspaceFile('not json')).toEqual({ ok: false, error: "This file isn't valid JSON." })
    expect(parseWorkspaceFile('{"hello":1}')).toEqual({ ok: false, error: "This file isn't a localgrid export." })
    expect(parseWorkspaceFile(JSON.stringify({ format: WORKSPACE_FILE_FORMAT, version: 99, workspace: {} }))).toEqual({
      ok: false,
      error: 'This file was exported by a newer version of localgrid.',
    })
    expect(
      parseWorkspaceFile(JSON.stringify({ format: WORKSPACE_FILE_FORMAT, version: 1, workspace: { v: 1 } })),
    ).toEqual({ ok: false, error: "This file doesn't match a dashboard layout." })
    expect(
      parseWorkspaceFile(
        JSON.stringify({ format: WORKSPACE_FILE_FORMAT, version: 1, workspace: { v: 1, a: 'x', d: [] } }),
      ),
    ).toEqual({ ok: false, error: "This file doesn't contain any dashboards." })
  })

  it('names the file after the local date', () => {
    expect(workspaceFileName(new Date(2026, 0, 5, 12))).toBe('localgrid-dashboards-2026-01-05.json')
  })
})

import LZString from 'lz-string'
import { nanoid } from 'nanoid'
import * as v from 'valibot'
import { getWidgetDefinition } from '@/widgets/registry'
import { sanitizeConfig } from '@/widgets/widgetConfig'
import { sanitizeConnections, type Connection } from '@/connectors/connectionGraph'
import { decompressLzString } from '@/lib/lzString'
import {
  DASHBOARD_LAYOUT_VERSION,
  WORKSPACE_LAYOUT_VERSION,
  type Dashboard,
  type WorkspaceLayoutV2,
} from '@/types/layout'

/** The URL fragment (`#layout=...`) param a shared dashboard link is encoded
 * into — a fragment rather than a query param so the (compressed but
 * unencrypted) layout is never sent to a server: fragments are stripped by
 * the browser before a request goes out, and never appear in server access
 * logs, `Referer` headers, or analytics. */
export const LAYOUT_HASH_PARAM = 'layout'

// --- Wire format --------------------------------------------------------
//
// What actually gets JSON.stringify'd and LZ-compressed into the URL is a
// separate, deliberately terse shape from `WorkspaceLayoutV2` (what the
// dashboard store and localStorage use) — every widget instance repeats its
// keys, so shaving bytes here pays off once per widget, not once per link.
// Two things drop out entirely rather than just getting shorter names:
//  - `instanceId`: never read back out. A share link only carries layout
//    (position/size), never a widget's live content, so nothing in the
//    decoded result needs to line up with the sender's original id — a
//    fresh one (see `nanoid(8)` below, the same call `addWidget` makes) is
//    exactly as good as carrying the sender's over the wire.
//  - `version`/`WORKSPACE_LAYOUT_VERSION`: that constant versions the
//    *storage* shape; the wire format gets its own counter (`v` below) so
//    the two can evolve independently.
const SHARE_WIRE_VERSION = 1

const WireWidgetSchema = v.object({
  wid: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  // Widget configuration, only present when the sender opted in. Optional
  // so links made before it existed still decode. Validated per widget in
  // `finalizeWorkspace`, not here.
  c: v.optional(v.record(v.string(), v.unknown())),
})

const WidgetIndexSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

const WireDashboardSchema = v.object({
  id: v.string(),
  n: v.string(),
  // Not `w` — that's already the per-widget width key one level down, and
  // reusing it here for "the widget list" would read as a typo forever.
  ws: v.array(WireWidgetSchema),
  // Connections, only when the sender opted in: [from, to, input] where
  // `from` and `to` index into `ws` (instance ids don't travel). Optional so
  // older links still decode. Checked against the widgets in
  // `finalizeWorkspace`.
  l: v.optional(v.array(v.tuple([WidgetIndexSchema, WidgetIndexSchema, v.string()]))),
})

const WireWorkspaceSchema = v.object({
  v: v.literal(SHARE_WIRE_VERSION),
  d: v.array(WireDashboardSchema),
  a: v.string(),
})

export type WireWorkspace = v.InferOutput<typeof WireWorkspaceSchema>

export interface EncodeOptions {
  /** Adds each widget's `config` as `c`. Off unless the user opts in. */
  includeConfig?: boolean
  /** Links to carry as each dashboard's `l`. Left out when undefined. */
  connections?: readonly Connection[]
}

/** A dashboard's links as `[from, to, input]` widget indexes. */
function wireLinks(dashboard: Dashboard, connections: readonly Connection[]): [number, number, string][] {
  const index = new Map(dashboard.widgets.map((widget, i) => [widget.instanceId, i]))
  return connections.flatMap((link) => {
    const from = index.get(link.from)
    const to = index.get(link.to)
    return from === undefined || to === undefined ? [] : [[from, to, link.input] as [number, number, string]]
  })
}

/** The exact payload a share link carries, before compression. Exported so
 * the share preview renders the same data that gets encoded. */
export function toWire(dashboards: Dashboard[], activeDashboardId: string, options: EncodeOptions = {}): WireWorkspace {
  return {
    v: SHARE_WIRE_VERSION,
    a: activeDashboardId,
    d: dashboards.map((dashboard) => {
      const links = options.connections ? wireLinks(dashboard, options.connections) : []
      return {
        id: dashboard.id,
        n: dashboard.name,
        ...(links.length > 0 && { l: links }),
        ws: dashboard.widgets.map((widget) => ({
          wid: widget.widgetId,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          ...(options.includeConfig && widget.config && Object.keys(widget.config).length > 0 && { c: widget.config }),
        })),
      }
    }),
  }
}

/** Reconstructs the storage shape from a decoded wire payload, minting a
 * fresh `instanceId` per widget — see the "drops out entirely" note above. */
function fromWire(wire: WireWorkspace): WorkspaceLayoutV2 {
  const connections: Connection[] = []
  const dashboards = wire.d.map((dashboard) => {
    const widgets = dashboard.ws.map((widget) => ({
      instanceId: nanoid(8),
      widgetId: widget.wid,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      ...(widget.c && { config: widget.c }),
    }))
    for (const [from, to, input] of dashboard.l ?? []) {
      if (widgets[from] && widgets[to]) {
        connections.push({ from: widgets[from].instanceId, to: widgets[to].instanceId, input })
      }
    }
    return { id: dashboard.id, name: dashboard.n, widgets }
  })
  return {
    version: WORKSPACE_LAYOUT_VERSION,
    activeDashboardId: wire.a,
    dashboards,
    ...(wire.d.some((dashboard) => dashboard.l) && { connections }),
  }
}

const WidgetInstanceSchema = v.object({
  instanceId: v.string(),
  widgetId: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
})

// Pre-tabs share-link shape — links generated before multi-dashboard support
// existed should still open, not error.
const LegacyLayoutSchema = v.object({
  version: v.literal(DASHBOARD_LAYOUT_VERSION),
  widgets: v.array(WidgetInstanceSchema),
})

/** Workspace -> compressed, URL-safe string for the `#layout=` fragment,
 * via the compact wire shape above (not the storage shape verbatim). */
export function encodeWorkspace(
  dashboards: Dashboard[],
  activeDashboardId: string,
  options: EncodeOptions = {},
): string {
  const wire = toWire(dashboards, activeDashboardId, options)
  return LZString.compressToEncodedURIComponent(JSON.stringify(wire))
}

export type DecodeResult = { ok: true; workspace: WorkspaceLayoutV2 } | { ok: false; error: string }

/** Drops any widget instance whose id no longer exists in the registry
 * (e.g. a stale link after a widget was renamed or removed), strips config
 * fields that don't match the widget's schema, and repairs
 * `activeDashboardId` if it doesn't point at a surviving dashboard. */
function finalizeWorkspace(workspace: WorkspaceLayoutV2): DecodeResult {
  const dashboards = workspace.dashboards.map((dashboard) => ({
    ...dashboard,
    widgets: dashboard.widgets
      .filter((widget) => getWidgetDefinition(widget.widgetId))
      .map(({ config, ...widget }) => {
        const sanitized = sanitizeConfig(widget.widgetId, config)
        return sanitized ? { ...widget, config: sanitized } : widget
      }),
  }))
  if (dashboards.length === 0) {
    return { ok: false, error: "This share link doesn't contain any dashboards." }
  }
  const activeDashboardId = dashboards.some((dashboard) => dashboard.id === workspace.activeDashboardId)
    ? workspace.activeDashboardId
    : dashboards[0].id
  const connections = workspace.connections && finalizeConnections(dashboards, workspace.connections)
  return {
    ok: true,
    workspace: {
      version: WORKSPACE_LAYOUT_VERSION,
      dashboards,
      activeDashboardId,
      ...(connections && { connections }),
    },
  }
}

/** Keeps links between surviving widgets that go from a declared output to
 * a declared input, then applies the usual one-per-input and no-loop rules. */
function finalizeConnections(dashboards: Dashboard[], connections: Connection[]): Connection[] {
  const widgetIds = new Map(
    dashboards.flatMap((dashboard) => dashboard.widgets.map((widget) => [widget.instanceId, widget.widgetId])),
  )
  const connectorsOf = (instanceId: string) => getWidgetDefinition(widgetIds.get(instanceId) ?? '')?.connectors
  return sanitizeConnections(
    connections.filter(
      (link) =>
        connectorsOf(link.from)?.output && connectorsOf(link.to)?.inputs?.some((input) => input.field === link.input),
    ),
  )
}

/** Reverses `encodeWorkspace`, validating the untrusted result before it's
 * allowed to reach the dashboard store. Tries the current compact wire
 * shape first, then falls back to the pre-tabs (single-dashboard) shape —
 * the two don't overlap in their keys, so there's no ambiguity between
 * them. */
export function decodeWorkspace(encoded: string): DecodeResult {
  const json = decompressLzString(encoded)
  if (!json) return { ok: false, error: 'Could not read this share link.' }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'This share link is corrupted.' }
  }

  const wireResult = v.safeParse(WireWorkspaceSchema, parsed)
  if (wireResult.success) {
    return finalizeWorkspace(fromWire(wireResult.output))
  }

  const legacyResult = v.safeParse(LegacyLayoutSchema, parsed)
  if (legacyResult.success) {
    return finalizeWorkspace({
      version: WORKSPACE_LAYOUT_VERSION,
      dashboards: [{ id: 'shared', name: 'Shared', widgets: legacyResult.output.widgets }],
      activeDashboardId: 'shared',
    })
  }

  return { ok: false, error: "This share link doesn't match a dashboard layout." }
}

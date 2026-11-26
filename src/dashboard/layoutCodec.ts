import LZString from 'lz-string'
import { nanoid } from 'nanoid'
import * as v from 'valibot'
import { getWidgetDefinition } from '@/widgets/registry'
import { sanitizeWidgetData } from '@/widgets/widgetData'
import { sanitizeLinks, type Link } from '@/flow/linkGraph'
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
  // Widget data, only present when the sender opted in. Optional
  // so links made before it existed still decode. Validated per widget in
  // `finalizeWorkspace`, not here.
  c: v.optional(v.record(v.string(), v.unknown())),
  // Widget content (useWidgetState fields), only in an exported file and
  // only when the user opted in. Never written to a share link, and never
  // read back from one (see `withContent`).
  s: v.optional(v.record(v.string(), v.unknown())),
})

const WidgetIndexSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

const WireDashboardSchema = v.object({
  id: v.string(),
  n: v.string(),
  // Not `w` — that's already the per-widget width key one level down, and
  // reusing it here for "the widget list" would read as a typo forever.
  ws: v.array(WireWidgetSchema),
  // Links, only when the sender opted in: [from, to, input] where
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
  /** Adds each widget's `data` as `c`. Off unless the user opts in. */
  includeData?: boolean
  /** Links to carry as each dashboard's `l`. Left out when undefined. */
  links?: readonly Link[]
  /** Each widget's content as `s`, for an exported file. Never set for a
   * share link. */
  content?: (instanceId: string) => Record<string, unknown> | undefined
}

/** A dashboard's links as `[from, to, input]` widget indexes. */
function wireLinks(dashboard: Dashboard, links: readonly Link[]): [number, number, string][] {
  const index = new Map(dashboard.widgets.map((widget, i) => [widget.instanceId, i]))
  return links.flatMap((link) => {
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
      const links = options.links ? wireLinks(dashboard, options.links) : []
      return {
        id: dashboard.id,
        n: dashboard.name,
        ...(links.length > 0 && { l: links }),
        ws: dashboard.widgets.map((widget) => {
          const content = options.content?.(widget.instanceId)
          return {
            wid: widget.widgetId,
            x: widget.x,
            y: widget.y,
            w: widget.w,
            h: widget.h,
            ...(options.includeData && widget.data && Object.keys(widget.data).length > 0 && { c: widget.data }),
            ...(content && Object.keys(content).length > 0 && { s: content }),
          }
        }),
      }
    }),
  }
}

/** Widget content keyed by instance id, then by `useWidgetState` field. */
export type WorkspaceContent = Record<string, Record<string, unknown>>

/** Reconstructs the storage shape from a decoded wire payload, minting a
 * fresh `instanceId` per widget — see the "drops out entirely" note above.
 * Content (`s`) is only collected when `withContent` is set. */
function fromWire(
  wire: WireWorkspace,
  withContent: boolean,
): { workspace: WorkspaceLayoutV2; content: WorkspaceContent } {
  const links: Link[] = []
  const content: WorkspaceContent = {}
  const dashboards = wire.d.map((dashboard) => {
    const widgets = dashboard.ws.map((widget) => {
      const instanceId = nanoid(8)
      if (withContent && widget.s) content[instanceId] = widget.s
      return {
        instanceId,
        widgetId: widget.wid,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        ...(widget.c && { data: widget.c }),
      }
    })
    for (const [from, to, input] of dashboard.l ?? []) {
      if (widgets[from] && widgets[to]) {
        links.push({ from: widgets[from].instanceId, to: widgets[to].instanceId, input })
      }
    }
    return { id: dashboard.id, name: dashboard.n, widgets }
  })
  return {
    workspace: {
      version: WORKSPACE_LAYOUT_VERSION,
      activeDashboardId: wire.a,
      dashboards,
      ...(wire.d.some((dashboard) => dashboard.l) && { links }),
    },
    content,
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

export type DecodeResult =
  | {
      ok: true
      workspace: WorkspaceLayoutV2
      /** Only from an exported file that carried widget content. */
      content?: WorkspaceContent
    }
  | { ok: false; error: string }

/** Where an untrusted payload came from, used for error messages and to
 * decide whether widget content may come in. */
export type PayloadSource = 'link' | 'file'

const SOURCE_LABEL: Record<PayloadSource, string> = { link: 'share link', file: 'file' }

/** Keeps the JSON values a widget could have stored itself (strings, finite
 * numbers, booleans, null, arrays and plain objects), dropping anything
 * else, such as a `File` or `Map` that a widget keeps in memory and that
 * JSON can't represent. Returns undefined when nothing survives. */
export function toJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 32) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const items = value.map((item) => toJsonValue(item, depth + 1))
    return items.includes(undefined) ? undefined : items
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value).flatMap(([key, item]) => {
      const kept = toJsonValue(item, depth + 1)
      return kept === undefined ? [] : [[key, kept] as const]
    })
    return Object.fromEntries(entries)
  }
  return undefined
}

/** One instance's content, reduced to JSON values (see `toJsonValue`).
 * Undefined when nothing survives. */
export function sanitizeWidgetContent(content: Record<string, unknown>): Record<string, unknown> | undefined {
  const kept = Object.entries(content).flatMap(([field, value]) => {
    const json = toJsonValue(value)
    return json === undefined ? [] : [[field, json] as const]
  })
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

/** Drops any widget instance whose id no longer exists in the registry
 * (e.g. a stale link after a widget was renamed or removed), strips data
 * fields that don't match the widget's schema, and repairs
 * `activeDashboardId` if it doesn't point at a surviving dashboard. */
function finalizeWorkspace(
  workspace: WorkspaceLayoutV2,
  source: PayloadSource,
  rawContent: WorkspaceContent = {},
): DecodeResult {
  const dashboards = workspace.dashboards.map((dashboard) => ({
    ...dashboard,
    widgets: dashboard.widgets
      .filter((widget) => getWidgetDefinition(widget.widgetId))
      .map(({ data, ...widget }) => {
        const sanitized = sanitizeWidgetData(widget.widgetId, data)
        return sanitized ? { ...widget, data: sanitized } : widget
      }),
  }))
  if (dashboards.length === 0) {
    return { ok: false, error: `This ${SOURCE_LABEL[source]} doesn't contain any dashboards.` }
  }
  const activeDashboardId = dashboards.some((dashboard) => dashboard.id === workspace.activeDashboardId)
    ? workspace.activeDashboardId
    : dashboards[0].id
  const links = workspace.links && finalizeLinks(dashboards, workspace.links)
  const content: WorkspaceContent = {}
  for (const dashboard of dashboards) {
    for (const widget of dashboard.widgets) {
      const raw = rawContent[widget.instanceId]
      const sanitized = raw && sanitizeWidgetContent(raw)
      if (sanitized) content[widget.instanceId] = sanitized
    }
  }
  return {
    ok: true,
    workspace: {
      version: WORKSPACE_LAYOUT_VERSION,
      dashboards,
      activeDashboardId,
      ...(links && { links }),
    },
    ...(Object.keys(content).length > 0 && { content }),
  }
}

/** Keeps links between surviving widgets that go from a declared output to
 * a declared input, then applies the usual one-per-input and no-loop rules. */
function finalizeLinks(dashboards: Dashboard[], links: Link[]): Link[] {
  const widgetIds = new Map(
    dashboards.flatMap((dashboard) => dashboard.widgets.map((widget) => [widget.instanceId, widget.widgetId])),
  )
  const flowOf = (instanceId: string) => getWidgetDefinition(widgetIds.get(instanceId) ?? '')?.flow
  return sanitizeLinks(
    links.filter(
      (link) => flowOf(link.from)?.output && flowOf(link.to)?.inputs?.some((input) => input.field === link.input),
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

  return parseWorkspacePayload(parsed, 'link')
}

/** Validates an already parsed, untrusted payload in the wire format (or
 * the pre-tabs shape) and turns it into a workspace. Shared by share links
 * and exported files. Widget content is only kept from a file: a share
 * link never carries it, so one that does is ignored. */
export function parseWorkspacePayload(parsed: unknown, source: PayloadSource): DecodeResult {
  const wireResult = v.safeParse(WireWorkspaceSchema, parsed)
  if (wireResult.success) {
    const { workspace, content } = fromWire(wireResult.output, source === 'file')
    return finalizeWorkspace(workspace, source, content)
  }

  const legacyResult = v.safeParse(LegacyLayoutSchema, parsed)
  if (legacyResult.success) {
    return finalizeWorkspace(
      {
        version: WORKSPACE_LAYOUT_VERSION,
        dashboards: [{ id: 'shared', name: 'Shared', widgets: legacyResult.output.widgets }],
        activeDashboardId: 'shared',
      },
      source,
    )
  }

  return { ok: false, error: `This ${SOURCE_LABEL[source]} doesn't match a dashboard layout.` }
}

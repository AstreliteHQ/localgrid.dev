import * as v from 'valibot'
import type { Link } from '@/flow/linkGraph'
import type { Dashboard } from '@/types/layout'
import {
  parseWorkspacePayload,
  sanitizeWidgetContent,
  toWire,
  type DecodeResult,
  type WireWorkspace,
} from './layoutCodec'

// --- Exported workspace file -------------------------------------------
//
// A small envelope around the share-link wire format (`toWire` in
// layoutCodec.ts), so a file and a link describe a workspace the same way
// and go through the same validation on the way in. The file always carries
// layout, widget data (`c`) and flow links (`l`). Widget content (`s`, the
// in-memory `useWidgetState` fields) is only written when the user opts in.

/** Marks a JSON file as a localgrid export. */
export const WORKSPACE_FILE_FORMAT = 'localgrid-workspace'
/** Versions the envelope, not the wire payload inside (which has its own `v`). */
export const WORKSPACE_FILE_VERSION = 1

/** Refuses anything bigger before reading it: a real export is a few KB,
 * or a few MB with pasted images in remembered notes. */
export const MAX_WORKSPACE_FILE_BYTES = 20 * 1024 * 1024

const WorkspaceFileSchema = v.object({
  format: v.literal(WORKSPACE_FILE_FORMAT),
  version: v.literal(WORKSPACE_FILE_VERSION),
  workspace: v.unknown(),
})

export interface WorkspaceFile {
  format: typeof WORKSPACE_FILE_FORMAT
  version: typeof WORKSPACE_FILE_VERSION
  exportedAt: string
  workspace: WireWorkspace
}

export interface WorkspaceFileOptions {
  links?: readonly Link[]
  /** `useWidgetStateStore` values (`<instanceId>:<field>` keys). Widget
   * content is only written when this is given. */
  stateValues?: Record<string, unknown>
  now?: Date
}

/** Groups flat `useWidgetStateStore` values by instance id, keeping only
 * the given instances and only values JSON can represent. */
export function collectWidgetContent(
  values: Record<string, unknown>,
  instanceIds: Iterable<string>,
): Record<string, Record<string, unknown>> {
  const wanted = new Set(instanceIds)
  const grouped: Record<string, Record<string, unknown>> = {}
  for (const [key, value] of Object.entries(values)) {
    const separator = key.indexOf(':')
    if (separator < 0) continue
    const instanceId = key.slice(0, separator)
    if (!wanted.has(instanceId)) continue
    ;(grouped[instanceId] ??= {})[key.slice(separator + 1)] = value
  }
  const content: Record<string, Record<string, unknown>> = {}
  for (const [instanceId, fields] of Object.entries(grouped)) {
    const sanitized = sanitizeWidgetContent(fields)
    if (sanitized) content[instanceId] = sanitized
  }
  return content
}

/** The object written to an exported `.json` file. */
export function buildWorkspaceFile(
  dashboards: Dashboard[],
  activeDashboardId: string,
  options: WorkspaceFileOptions = {},
): WorkspaceFile {
  const content =
    options.stateValues &&
    collectWidgetContent(
      options.stateValues,
      dashboards.flatMap((dashboard) => dashboard.widgets.map((widget) => widget.instanceId)),
    )
  return {
    format: WORKSPACE_FILE_FORMAT,
    version: WORKSPACE_FILE_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    workspace: toWire(dashboards, activeDashboardId, {
      includeData: true,
      links: options.links && options.links.length > 0 ? options.links : undefined,
      content: content ? (instanceId) => content[instanceId] : undefined,
    }),
  }
}

export function serializeWorkspaceFile(file: WorkspaceFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/** `localgrid-dashboards-2026-11-26.json`, in local time. */
export function workspaceFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `localgrid-dashboards-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** Reads an untrusted file's text back into a workspace, through the same
 * validation a share link gets, plus widget content when the file has it. */
export function parseWorkspaceFile(text: string): DecodeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "This file isn't valid JSON." }
  }
  const envelope = v.safeParse(WorkspaceFileSchema, parsed)
  if (!envelope.success) {
    const format = (parsed as { format?: unknown } | null)?.format
    return {
      ok: false,
      error:
        format === WORKSPACE_FILE_FORMAT
          ? 'This file was exported by a newer version of localgrid.'
          : "This file isn't a localgrid export.",
    }
  }
  return parseWorkspacePayload(envelope.output.workspace, 'file')
}

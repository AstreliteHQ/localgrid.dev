import { colord } from 'colord'

/** A link pushing one widget's output into one input of another widget.
 * `from` and `to` are instance ids, unique across dashboards; `input` is the
 * target's `useWidgetState` field, as declared in its `connectors.inputs`. */
export interface Connection {
  from: string
  to: string
  input: string
}

/** Input assumed for links saved before widgets declared their inputs. */
const LEGACY_INPUT = 'input'

/** Identifies a link: each input takes at most one. */
export function connectionKey(link: Pick<Connection, 'to' | 'input'>): string {
  return `${link.to}:${link.input}`
}

/** Whether `from -> to.input` can be added: no self link, no duplicate, and
 * no path already leading from `to` back to `from` (that would close a loop).
 * The link currently feeding that input, if any, is ignored since it gets
 * replaced. Loops are checked between widgets, whatever the input. */
export function canConnect(connections: readonly Connection[], from: string, to: string, input: string): boolean {
  if (from === to) return false
  if (connections.some((link) => link.from === from && link.to === to && link.input === input)) return false
  const others = connections.filter((link) => link.to !== to || link.input !== input)
  const seen = new Set<string>()
  const stack = [to]
  while (stack.length > 0) {
    const node = stack.pop() as string
    if (node === from) return false
    if (seen.has(node)) continue
    seen.add(node)
    for (const link of others) if (link.from === node) stack.push(link.to)
  }
  return true
}

/** Rebuilds a stored list link by link, dropping malformed entries, second
 * links into one input and anything that would form a loop. */
export function sanitizeConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) return []
  const kept: Connection[] = []
  for (const item of value as Partial<Connection>[]) {
    if (typeof item?.from !== 'string' || typeof item.to !== 'string') continue
    const input = typeof item.input === 'string' ? item.input : LEGACY_INPUT
    const key = connectionKey({ to: item.to, input })
    if (kept.some((link) => connectionKey(link) === key) || !canConnect(kept, item.from, item.to, input)) continue
    kept.push({ from: item.from, to: item.to, input })
  }
  return kept
}

/** Default conveyor colors, user editable in Settings > Connectors. */
export const DEFAULT_CONNECTOR_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4']

/** Stable color per source widget, so wires fanning out of it match. */
export function connectionColor(from: string, colors: readonly string[]): string {
  let hash = 0
  for (let i = 0; i < from.length; i++) hash = (hash * 31 + from.charCodeAt(i)) | 0
  return colors[Math.abs(hash) % colors.length]
}

/** Text color that stays readable on a connector color. */
export function readableTextColor(background: string): string {
  return colord(background).isLight() ? '#0f172a' : '#ffffff'
}

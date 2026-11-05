import { colord } from 'colord'

/** A link pushing one widget's output into one input of another widget.
 * `from` and `to` are instance ids, unique across dashboards; `input` is the
 * target's `useWidgetState` field, as declared in its `flow.inputs`. */
export interface Link {
  from: string
  to: string
  input: string
  /** Palette position chosen for this link; absent means the source's color. */
  color?: number
}

/** Input assumed for links saved before widgets declared their inputs. */
const LEGACY_INPUT = 'input'

/** Identifies a link: each input takes at most one. */
export function linkKey(link: Pick<Link, 'to' | 'input'>): string {
  return `${link.to}:${link.input}`
}

/** Whether `from -> to.input` can be added: no self link, no duplicate, and
 * no path already leading from `to` back to `from` (that would close a loop).
 * The link currently feeding that input, if any, is ignored since it gets
 * replaced. Loops are checked between widgets, whatever the input. */
export function canConnect(links: readonly Link[], from: string, to: string, input: string): boolean {
  if (from === to) return false
  if (links.some((link) => link.from === from && link.to === to && link.input === input)) return false
  const others = links.filter((link) => link.to !== to || link.input !== input)
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
export function sanitizeLinks(value: unknown): Link[] {
  if (!Array.isArray(value)) return []
  const kept: Link[] = []
  for (const item of value as Partial<Link>[]) {
    if (typeof item?.from !== 'string' || typeof item.to !== 'string') continue
    const input = typeof item.input === 'string' ? item.input : LEGACY_INPUT
    const key = linkKey({ to: item.to, input })
    if (kept.some((link) => linkKey(link) === key) || !canConnect(kept, item.from, item.to, input)) continue
    const color = isPaletteIndex(item.color) ? item.color : undefined
    kept.push({ from: item.from, to: item.to, input, ...(color !== undefined && { color }) })
  }
  return kept
}

function isPaletteIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < DEFAULT_FLOW_COLORS.length
}

/** Default conveyor colors, user editable in Settings > Flow. */
export const DEFAULT_FLOW_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4']

/** Stable color per source widget, so wires fanning out of it match. */
export function autoLinkColor(from: string, colors: readonly string[]): string {
  let hash = 0
  for (let i = 0; i < from.length; i++) hash = (hash * 31 + from.charCodeAt(i)) | 0
  return colors[Math.abs(hash) % colors.length]
}

/** A link's color: the palette entry chosen for it, or its source's color. */
export function linkColor(link: Pick<Link, 'from' | 'color'>, colors: readonly string[]): string {
  return link.color !== undefined && colors[link.color] ? colors[link.color] : autoLinkColor(link.from, colors)
}

/** Text color that stays readable on a link color. */
export function readableTextColor(background: string): string {
  return colord(background).isLight() ? '#0f172a' : '#ffffff'
}

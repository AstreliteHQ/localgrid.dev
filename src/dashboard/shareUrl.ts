import type { Link } from '@/flow/linkGraph'
import type { Dashboard } from '@/types/layout'
import { encodeWorkspace, LAYOUT_HASH_PARAM } from './layoutCodec'

export interface ShareOptions {
  /** Every dashboard and widget position. Off gives the bare app URL. */
  includeLayout: boolean
  /** Widget data too. Ignored unless `includeLayout` is on. */
  includeData: boolean
  /** Links between widgets to carry. Ignored unless `includeLayout` is on. */
  links?: readonly Link[]
}

const LAYOUT_ONLY: ShareOptions = { includeLayout: true, includeData: false }

/** Builds a URL that reproduces the workspace (every dashboard, not just
 * the active one) when opened, or just the app address when layout is left
 * out. Encoded into the fragment (`#layout=...`), not a query param, so it's
 * never sent to a server. Widget state never travels; widget data only
 * when `includeData` is set. */
export function buildShareUrl(
  dashboards: Dashboard[],
  activeDashboardId: string,
  options: ShareOptions = LAYOUT_ONLY,
): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (!options.includeLayout) return url.toString()
  const hashParams = new URLSearchParams()
  hashParams.set(
    LAYOUT_HASH_PARAM,
    encodeWorkspace(dashboards, activeDashboardId, {
      includeData: options.includeData,
      links: options.links,
    }),
  )
  url.hash = hashParams.toString()
  return url.toString()
}

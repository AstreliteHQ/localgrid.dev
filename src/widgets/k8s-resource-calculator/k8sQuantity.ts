/** Parsing and formatting for Kubernetes "quantity" strings (the values
 * that go in `resources.requests`/`resources.limits`), e.g. `500m`, `2`,
 * `128Mi`, `1.5Gi`. No DOM, no widget state — just strings in, numbers (in
 * a fixed base unit, so they can be summed) out. */

// Binary (1024-based) memory suffixes, as Kubernetes defines them.
const BINARY_UNITS: Record<string, number> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
}

// Decimal (1000-based) memory suffixes. Kubernetes itself only accepts a
// lowercase `k`, never `K` — but reading someone's pasted manifest is more
// useful if a capitalized "500K" (a common typo) still parses instead of
// silently coming back as "unset".
const DECIMAL_UNITS: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

const CPU_PATTERN = /^(-?\d+(?:\.\d+)?)(m)?$/
const MEMORY_PATTERN = /^(-?\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|[kKMGTPE])?$/

/** Parses a CPU quantity (`"500m"`, `"0.5"`, `2`, …) into millicores. A bare
 * number (string or already-numeric, since unquoted YAML like `cpu: 2`
 * parses to a JS number) is cores; an `m` suffix is already millicores. */
export function parseCpuQuantity(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const text = String(raw).trim()
  if (!text) return null
  const match = CPU_PATTERN.exec(text)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return match[2] === 'm' ? value : value * 1000
}

/** Parses a memory quantity (`"128Mi"`, `"500M"`, `"1.5Gi"`, `1000`, …)
 * into bytes. */
export function parseMemoryQuantity(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const text = String(raw).trim()
  if (!text) return null
  const match = MEMORY_PATTERN.exec(text)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const suffix = match[2]
  if (!suffix) return value
  return value * (BINARY_UNITS[suffix] ?? DECIMAL_UNITS[suffix])
}

function trimTrailingZeros(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, '') || '0'
}

/** Formats millicores back into the shorter of `Nm` or `N` cores, whichever
 * is how someone would actually write that quantity in a manifest. */
export function formatCpuMillicores(millicores: number): string {
  if (millicores === 0) return '0'
  if (Math.abs(millicores) < 1000) return `${Math.round(millicores)}m`
  return trimTrailingZeros(millicores / 1000, 3)
}

const DISPLAY_BINARY_UNITS: [string, number][] = [
  ['Ei', 2 ** 60],
  ['Pi', 2 ** 50],
  ['Ti', 2 ** 40],
  ['Gi', 2 ** 30],
  ['Mi', 2 ** 20],
  ['Ki', 2 ** 10],
]

/** Formats bytes back into the largest binary unit that keeps the number
 * at or above 1 (`Mi`, `Gi`, …) — matches how memory is almost always
 * written in a manifest, rather than decimal (`M`, `G`) units. */
export function formatMemoryBytes(bytes: number): string {
  if (bytes === 0) return '0'
  for (const [suffix, size] of DISPLAY_BINARY_UNITS) {
    if (Math.abs(bytes) >= size) return `${trimTrailingZeros(bytes / size, 2)}${suffix}`
  }
  return String(bytes)
}

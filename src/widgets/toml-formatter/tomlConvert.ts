import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

/** What the widget shows. Every mode but `from-json` reads TOML from the
 * input editor; `from-json` reads JSON and writes TOML. */
export type TomlMode = 'json' | 'tree' | 'toml' | 'from-json'

export type InputFormat = 'toml' | 'json'

export function inputFormatOf(mode: TomlMode): InputFormat {
  return mode === 'from-json' ? 'json' : 'toml'
}

export interface TomlParseResult {
  /** Plain JSON-compatible data (dates already turned into ISO strings),
   * undefined for blank input or on error. */
  data: Record<string, unknown> | undefined
  /** The value smol-toml returned, kept as is so re-stringifying it as TOML
   * keeps dates as real TOML dates rather than quoted strings. */
  raw: Record<string, unknown> | undefined
  error: string | null
}

export interface ConversionResult {
  output: string
  error: string | null
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message.trimEnd() : fallback
}

/** Parses a TOML document. smol-toml's error messages already carry a small
 * code frame pointing at the offending line and column, so they are passed
 * through untouched. */
export function parseTomlDocument(input: string): TomlParseResult {
  if (!input.trim()) return { data: undefined, raw: undefined, error: null }
  try {
    const raw = parseToml(input) as Record<string, unknown>
    // TomlDate extends Date, so a JSON round trip turns every date into its
    // TOML textual form, which is what JSON output and the tree should show.
    // inf and nan have no JSON form and become null, same as JSON.stringify.
    const data = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
    return { data, raw, error: null }
  } catch (err) {
    return { data: undefined, raw: undefined, error: errorMessage(err, 'Invalid TOML') }
  }
}

export function tomlToJson(input: string): ConversionResult {
  const { data, error } = parseTomlDocument(input)
  if (error) return { output: '', error }
  if (data === undefined) return { output: '', error: null }
  return { output: JSON.stringify(data, null, 2), error: null }
}

/** Re-serializes a TOML document in a normalized layout. Comments and the
 * original key order inside inline tables are not preserved, since the
 * document goes through a parse and stringify round trip. */
export function formatToml(input: string): ConversionResult {
  const { raw, error } = parseTomlDocument(input)
  if (error) return { output: '', error }
  if (raw === undefined) return { output: '', error: null }
  return { output: stringifyToml(raw), error: null }
}

function describePath(path: (string | number)[]): string {
  return (
    '$' +
    path
      .map((part) =>
        typeof part === 'number' ? `[${part}]` : /^[A-Za-z_][\w-]*$/.test(part) ? `.${part}` : `["${part}"]`,
      )
      .join('')
  )
}

/** TOML has no null. smol-toml silently drops null object values and throws
 * a path-less error for null array items, so find the first one up front to
 * give a message that says where it is. */
export function findNull(value: unknown, path: (string | number)[] = []): string | null {
  if (value === null) return describePath(path)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNull(value[i], [...path, i])
      if (found) return found
    }
  } else if (typeof value === 'object' && value !== undefined) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const found = findNull(child, [...path, key])
      if (found) return found
    }
  }
  return null
}

export function jsonToToml(input: string): ConversionResult {
  if (!input.trim()) return { output: '', error: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch (err) {
    return { output: '', error: errorMessage(err, 'Invalid JSON') }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { output: '', error: 'A TOML document must be an object at the top level' }
  }
  const nullPath = findNull(parsed)
  if (nullPath) return { output: '', error: `TOML has no null value (found at ${nullPath})` }
  try {
    return { output: stringifyToml(parsed), error: null }
  } catch (err) {
    return { output: '', error: errorMessage(err, 'Cannot convert to TOML') }
  }
}

/** When the mode changes which format the input editor expects, carry the
 * document across (TOML to JSON or back) so switching between "To JSON" and
 * "From JSON" works as a round trip. Input that does not convert cleanly is
 * left as is, and the new mode reports the error. */
export function carryInputAcross(input: string, from: TomlMode, to: TomlMode): string {
  const fromFormat = inputFormatOf(from)
  const toFormat = inputFormatOf(to)
  if (fromFormat === toFormat || !input.trim()) return input
  const { output, error } = fromFormat === 'toml' ? tomlToJson(input) : jsonToToml(input)
  return error ? input : output
}

/** Pure rendering logic behind the Jinja Template Renderer widget.
 *
 * Rendering itself is delegated to Nunjucks, a JS templating engine built
 * to stay "as close as possible" to Jinja2's own syntax (`{{ }}`, `{% %}`,
 * filters, loops, conditionals, macros...) — there's no real Python Jinja2
 * available in a browser, and Nunjucks is the closest practical match. It
 * isn't a byte-for-byte reimplementation, so a handful of Python-specific
 * filters/behaviors won't carry over exactly.
 */

import nunjucks from 'nunjucks'
import { parse as parseYaml } from 'yaml'

export type DataFormat = 'json' | 'yaml'

export interface RenderResult {
  output: string
  error: string | null
}

// autoescape defaults to `true` in Nunjucks but `false` in vanilla Jinja2
// (Flask turns it on itself, but a bare Jinja2 Environment doesn't) —
// explicitly off here to match Jinja2's own default rather than a
// framework's. throwOnUndefined left at its default `false`, the same
// permissive-by-default behavior Jinja2's own Undefined class has for a
// plain `{{ missing }}` reference.
const env = new nunjucks.Environment(null, { autoescape: false })

function parseData(input: string, format: DataFormat): unknown {
  const trimmed = input.trim()
  if (!trimmed) return {}
  return format === 'json' ? JSON.parse(input) : parseYaml(input)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Renders `template` against `dataInput` (parsed as `dataFormat`). The
 * parsed data has to be an object, not an array or scalar — its top-level
 * keys are what become the template's variables, the same way Jinja2 itself
 * is always called with a dict of variables rather than a bare value. */
export function renderTemplate(template: string, dataInput: string, dataFormat: DataFormat): RenderResult {
  let data: unknown
  try {
    data = parseData(dataInput, dataFormat)
  } catch (err) {
    const label = dataFormat === 'json' ? 'JSON' : 'YAML'
    return { output: '', error: `Invalid ${label} data: ${err instanceof Error ? err.message : 'could not parse'}` }
  }

  if (!isPlainObject(data)) {
    return {
      output: '',
      error: 'Data must be an object (e.g. { "name": "value" }) so its keys become template variables.',
    }
  }

  try {
    return { output: env.renderString(template, data), error: null }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'Template render failed' }
  }
}

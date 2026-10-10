/** Pure JSON Schema validation logic behind the JSON Schema Validator
 * widget, no DOM, no widget state, just a schema and a document in, a
 * validation outcome out. Kept separate from the widget component so it's
 * unit-testable without rendering. */

import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020'
import { parse as parseYaml } from 'yaml'
import { lineForPointer, parseDocumentIndex } from './documentLineForPointer'

export type DocumentFormat = 'json' | 'yaml'

// The widget calls this on every keystroke, but the schema itself usually
// changes far less often than the document being checked against it —
// recompiling an unchanged schema's Ajv validator on every call would slow
// live validation down for no reason. A single slot (rather than a map
// keyed by every schema the widget has ever seen) is enough: it's always a
// hit while only the document changes, and never grows unbounded as the
// user types into the schema editor.
let cachedSchema: { schemaText: string; validate: ValidateFunction } | null = null

function compileSchema(schemaText: string, schema: unknown): ValidateFunction {
  if (cachedSchema && cachedSchema.schemaText === schemaText) return cachedSchema.validate
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  const validate = ajv.compile(schema as object)
  cachedSchema = { schemaText, validate }
  return validate
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** ajv points `additionalProperties`/`propertyNames` errors at the
 * *containing* object, with the actual offending property name tucked into
 * `error.params` instead — so taken at face value, `instancePath` would
 * locate (and show the line of) the whole object rather than the property
 * that's actually wrong. */
function effectiveInstancePath(error: ErrorObject): string {
  const extra =
    error.keyword === 'additionalProperties'
      ? error.params.additionalProperty
      : error.keyword === 'propertyNames'
        ? error.params.propertyName
        : undefined
  return typeof extra === 'string' ? `${error.instancePath}/${escapePointerSegment(extra)}` : error.instancePath
}

export interface ValidationIssue {
  /** JSON Pointer to the offending value, e.g. "/items/0/price" — empty
   * for an error about the document's root. */
  path: string
  message: string
  /** 1-based line number of the offending value in the original
   * `documentText`, or null when it can't be found there (see
   * `lineForPointer`). */
  line: number | null
}

export type ValidationOutcome =
  | { status: 'empty' }
  | { status: 'schema-error'; message: string }
  | { status: 'document-error'; message: string }
  | { status: 'valid' }
  | { status: 'invalid'; issues: ValidationIssue[] }

/** Validates `documentText` (parsed as `format`) against `schemaText`
 * (always JSON, per the JSON Schema spec itself). Distinguishes a broken
 * schema from a broken document from an actual validation failure, since
 * each needs a different message and UI treatment. */
export function validateJsonSchema(schemaText: string, documentText: string, format: DocumentFormat): ValidationOutcome {
  if (!schemaText.trim() || !documentText.trim()) return { status: 'empty' }

  let schema: unknown
  try {
    schema = JSON.parse(schemaText)
  } catch (err) {
    return { status: 'schema-error', message: err instanceof Error ? err.message : 'Invalid JSON schema' }
  }

  let document: unknown
  try {
    document = format === 'yaml' ? parseYaml(documentText) : JSON.parse(documentText)
  } catch (err) {
    return { status: 'document-error', message: err instanceof Error ? err.message : 'Invalid document' }
  }

  let validate: ValidateFunction
  try {
    validate = compileSchema(schemaText, schema)
  } catch (err) {
    return { status: 'schema-error', message: err instanceof Error ? err.message : 'Invalid JSON schema' }
  }

  if (validate(document)) return { status: 'valid' }

  // Parsed, and its newlines scanned, once per validation and reused for
  // every issue below — not once per issue, since `allErrors: true` means
  // there can be one for every invalid entry in a large array.
  const documentIndex = parseDocumentIndex(documentText)

  const issues = (validate.errors ?? []).map((error) => {
    const pointer = effectiveInstancePath(error)
    return {
      path: pointer || '/',
      message: error.message ?? 'is invalid',
      line: documentIndex && lineForPointer(documentIndex, pointer),
    }
  })
  return { status: 'invalid', issues }
}

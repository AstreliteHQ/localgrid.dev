/** Pure JSON Schema validation logic behind the JSON Schema Validator
 * widget, no DOM, no widget state, just a schema and a document in, a
 * validation outcome out. Kept separate from the widget component so it's
 * unit-testable without rendering, and so a fresh Ajv instance (schema
 * compilation is read into mutable internal caches) is built per call
 * rather than shared across the widget's whole lifetime. */

import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { parse as parseYaml } from 'yaml'

export type DocumentFormat = 'json' | 'yaml'

export interface ValidationIssue {
  /** JSON Pointer to the offending value, e.g. "/items/0/price" — empty
   * for an error about the document's root. */
  path: string
  message: string
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

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)

  let validate
  try {
    validate = ajv.compile(schema as object)
  } catch (err) {
    return { status: 'schema-error', message: err instanceof Error ? err.message : 'Invalid JSON schema' }
  }

  if (validate(document)) return { status: 'valid' }

  const issues = (validate.errors ?? []).map((error) => ({
    path: error.instancePath || '/',
    message: error.message ?? 'is invalid',
  }))
  return { status: 'invalid', issues }
}

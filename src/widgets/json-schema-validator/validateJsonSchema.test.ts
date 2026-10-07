import { describe, expect, it } from 'vitest'
import { validateJsonSchema } from './validateJsonSchema'

const PERSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
  },
  required: ['name'],
  additionalProperties: false,
})

describe('validateJsonSchema', () => {
  it('is empty when either input is blank', () => {
    expect(validateJsonSchema('', '{}', 'json')).toEqual({ status: 'empty' })
    expect(validateJsonSchema(PERSON_SCHEMA, '', 'json')).toEqual({ status: 'empty' })
    expect(validateJsonSchema('  ', '  ', 'json')).toEqual({ status: 'empty' })
  })

  it('reports an unparsable schema distinctly from an invalid document', () => {
    const outcome = validateJsonSchema('{ not json', '{}', 'json')
    expect(outcome.status).toBe('schema-error')
  })

  it('reports a schema whose keywords do not form a valid JSON Schema', () => {
    const outcome = validateJsonSchema('{ "type": "not-a-real-type" }', '{}', 'json')
    expect(outcome.status).toBe('schema-error')
  })

  it('reports an unparsable JSON document', () => {
    const outcome = validateJsonSchema(PERSON_SCHEMA, '{ not json', 'json')
    expect(outcome.status).toBe('document-error')
  })

  it('reports an unparsable YAML document', () => {
    const outcome = validateJsonSchema(PERSON_SCHEMA, '- not\n  valid: [yaml', 'yaml')
    expect(outcome.status).toBe('document-error')
  })

  it('passes a JSON document that satisfies the schema', () => {
    expect(validateJsonSchema(PERSON_SCHEMA, '{"name": "Ada", "age": 36}', 'json')).toEqual({ status: 'valid' })
  })

  it('passes an equivalent YAML document that satisfies the schema', () => {
    expect(validateJsonSchema(PERSON_SCHEMA, 'name: Ada\nage: 36\n', 'yaml')).toEqual({ status: 'valid' })
  })

  it('collects every violation, each with the path to the offending value', () => {
    const outcome = validateJsonSchema(PERSON_SCHEMA, '{"age": -1, "extra": true}', 'json')
    expect(outcome.status).toBe('invalid')
    if (outcome.status !== 'invalid') return
    expect(outcome.issues.length).toBeGreaterThanOrEqual(2)
    expect(outcome.issues.some((issue) => issue.path === '/')).toBe(true)
    expect(outcome.issues.some((issue) => issue.path === '/age')).toBe(true)
  })

  it('validates string formats via ajv-formats', () => {
    const emailSchema = JSON.stringify({ type: 'string', format: 'email' })
    expect(validateJsonSchema(emailSchema, '"not-an-email"', 'json').status).toBe('invalid')
    expect(validateJsonSchema(emailSchema, '"ada@example.com"', 'json')).toEqual({ status: 'valid' })
  })
})

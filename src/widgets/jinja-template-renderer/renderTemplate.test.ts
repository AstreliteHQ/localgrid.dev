import { describe, expect, it } from 'vitest'
import { renderTemplate } from './renderTemplate'

describe('renderTemplate, basics', () => {
  it('substitutes a variable', () => {
    const result = renderTemplate('Hello {{ name }}!', '{"name": "World"}', 'json')
    expect(result).toEqual({ output: 'Hello World!', error: null })
  })

  it('treats blank data as an empty context rather than an error', () => {
    const result = renderTemplate('Static text', '', 'json')
    expect(result).toEqual({ output: 'Static text', error: null })
  })

  it('renders an empty string for a missing variable rather than erroring', () => {
    const result = renderTemplate('[{{ missing }}]', '{}', 'json')
    expect(result).toEqual({ output: '[]', error: null })
  })
})

describe('renderTemplate, control flow', () => {
  it('runs a for loop over a list', () => {
    const result = renderTemplate('{% for x in items %}{{ x }},{% endfor %}', '{"items": [1, 2, 3]}', 'json')
    expect(result).toEqual({ output: '1,2,3,', error: null })
  })

  it('runs an if/else conditional', () => {
    const template = '{% if ok %}yes{% else %}no{% endif %}'
    expect(renderTemplate(template, '{"ok": true}', 'json').output).toBe('yes')
    expect(renderTemplate(template, '{"ok": false}', 'json').output).toBe('no')
  })
})

describe('renderTemplate, filters', () => {
  it('applies a built-in Jinja-style filter', () => {
    const result = renderTemplate('{{ name | upper }}', '{"name": "ada"}', 'json')
    expect(result).toEqual({ output: 'ADA', error: null })
  })

  it('chains filters left to right', () => {
    const result = renderTemplate('{{ name | upper | trim }}', '{"name": "  ada  "}', 'json')
    expect(result.output).toBe('ADA')
  })
})

describe('renderTemplate, data formats', () => {
  it('accepts YAML data the same way it accepts JSON', () => {
    const result = renderTemplate('{{ name }} is {{ age }}', 'name: Ada\nage: 36', 'yaml')
    expect(result).toEqual({ output: 'Ada is 36', error: null })
  })
})

describe('renderTemplate, invalid data', () => {
  it('reports a JSON parse error without touching the template', () => {
    const result = renderTemplate('{{ name }}', '{not valid json', 'json')
    expect(result.output).toBe('')
    expect(result.error).toMatch(/invalid json data/i)
  })

  it('reports a YAML parse error', () => {
    const result = renderTemplate('{{ name }}', '- not: [valid\n  yaml: at all: nope', 'yaml')
    expect(result.output).toBe('')
    expect(result.error).toMatch(/invalid yaml data/i)
  })

  it('rejects a top-level array, since template variables need named keys', () => {
    const result = renderTemplate('{{ name }}', '[1, 2, 3]', 'json')
    expect(result.output).toBe('')
    expect(result.error).toMatch(/must be an object/i)
  })

  it('rejects a top-level scalar the same way', () => {
    const result = renderTemplate('{{ name }}', '"just a string"', 'json')
    expect(result.error).toMatch(/must be an object/i)
  })
})

describe('renderTemplate, invalid templates', () => {
  it('reports a syntax error for an unclosed block', () => {
    const result = renderTemplate('{% for x in items %}{{ x }}', '{"items": [1]}', 'json')
    expect(result.output).toBe('')
    expect(result.error).not.toBeNull()
  })

  it('reports a syntax error for an unknown tag', () => {
    const result = renderTemplate('{% bogus %}', '{}', 'json')
    expect(result.error).not.toBeNull()
  })
})

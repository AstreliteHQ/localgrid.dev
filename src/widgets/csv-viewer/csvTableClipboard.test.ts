import { describe, expect, it } from 'vitest'
import { buildTableClipboardPayload } from './csvTableClipboard'

describe('buildTableClipboardPayload', () => {
  it('builds an HTML table with a header and body rows', () => {
    const { html } = buildTableClipboardPayload(
      ['name', 'role'],
      [
        ['Ada', 'Engineer'],
        ['Grace', 'Engineer'],
      ],
    )

    expect(html).toBe(
      '<table><thead><tr><th>name</th><th>role</th></tr></thead>' +
        '<tbody><tr><td>Ada</td><td>Engineer</td></tr><tr><td>Grace</td><td>Engineer</td></tr></tbody></table>',
    )
  })

  it('escapes HTML-significant characters in cell values', () => {
    const { html } = buildTableClipboardPayload(['name'], [['<script>&"evil"</script>']])

    expect(html).toContain('&lt;script&gt;&amp;&quot;evil&quot;&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('builds a tab-separated plain-text fallback with the header included', () => {
    const { text } = buildTableClipboardPayload(
      ['name', 'role'],
      [
        ['Ada', 'Engineer'],
        ['Grace', 'Engineer'],
      ],
    )

    expect(text).toBe('name\trole\nAda\tEngineer\nGrace\tEngineer')
  })

  it('handles no body rows', () => {
    const { html, text } = buildTableClipboardPayload(['name'], [])

    expect(html).toBe('<table><thead><tr><th>name</th></tr></thead><tbody></tbody></table>')
    expect(text).toBe('name')
  })
})

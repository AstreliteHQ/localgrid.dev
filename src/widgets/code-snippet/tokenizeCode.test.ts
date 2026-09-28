import { describe, expect, it } from 'vitest'
import { loadParser } from './languages'
import { tokenizeCode, type Token } from './tokenizeCode'

/** Concatenates every token's text back together, so a test can assert
 * against it without caring how the source got split into runs. */
function plainText(tokens: Token[]): string {
  return tokens.map((token) => token.text).join('')
}

function categoriesOf(tokens: Token[], text: string): (string | null)[] {
  return tokens.filter((token) => token.text === text).map((token) => token.category)
}

describe('tokenizeCode', () => {
  it('is empty for empty input', () => {
    expect(tokenizeCode('', null)).toEqual([])
  })

  it('returns the whole input as one uncategorized run when there is no parser', () => {
    expect(tokenizeCode('hello world', null)).toEqual([{ text: 'hello world', category: null }])
  })

  it('always reconstructs the exact source text, in order', async () => {
    const parser = await loadParser('javascript')
    const code = 'function greet(name) {\n  return `Hi ${name}`;\n}\n'
    expect(plainText(tokenizeCode(code, parser))).toBe(code)
  })

  it('categorizes JavaScript keywords, strings, and comments', async () => {
    const parser = await loadParser('javascript')
    const tokens = tokenizeCode('const x = "hi"; // note', parser)
    expect(categoriesOf(tokens, 'const')).toContain('keyword')
    expect(categoriesOf(tokens, '"hi"')).toContain('string')
    expect(categoriesOf(tokens, '// note')).toContain('comment')
  })

  it('categorizes a Python function definition and its docstring', async () => {
    const parser = await loadParser('python')
    const tokens = tokenizeCode('def greet(name):\n    """Say hi."""\n    return name\n', parser)
    expect(categoriesOf(tokens, 'def')).toContain('keyword')
    expect(categoriesOf(tokens, '"""Say hi."""')).toContain('string')
  })

  it('categorizes HTML tag and attribute names separately from their content', async () => {
    const parser = await loadParser('html')
    const tokens = tokenizeCode('<div class="a">hi</div>', parser)
    expect(categoriesOf(tokens, 'div')).toContain('tag')
    expect(categoriesOf(tokens, 'class')).toContain('attribute')
  })

  it('categorizes Markdown headings, bold text, and inline code', async () => {
    const parser = await loadParser('markdown')
    const tokens = tokenizeCode('# Title\n\n**bold** and `code`\n', parser)
    expect(categoriesOf(tokens, ' Title')).toContain('heading')
    expect(categoriesOf(tokens, 'bold')).toContain('strong')
    expect(categoriesOf(tokens, 'code')).toContain('code')
  })

  it('leaves whitespace between tokens uncategorized rather than dropping it', async () => {
    const parser = await loadParser('json')
    const tokens = tokenizeCode('{\n  "a": 1\n}', parser)
    expect(plainText(tokens)).toBe('{\n  "a": 1\n}')
    expect(tokens.some((token) => token.category === null && token.text.includes('\n'))).toBe(true)
  })
})

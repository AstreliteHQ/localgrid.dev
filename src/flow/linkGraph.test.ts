import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FLOW_COLORS,
  canConnect,
  autoLinkColor,
  linkKey,
  linkColor,
  readableTextColor,
  sanitizeLinks,
} from './linkGraph'

const link = (from: string, to: string, input = 'input') => ({ from, to, input })

describe('canConnect', () => {
  it('accepts a link between two unconnected widgets', () => {
    expect(canConnect([], 'a', 'b', 'input')).toBe(true)
  })

  it('rejects a widget linked to itself', () => {
    expect(canConnect([], 'a', 'a', 'input')).toBe(false)
  })

  it('rejects a link that already exists', () => {
    expect(canConnect([link('a', 'b')], 'a', 'b', 'input')).toBe(false)
  })

  it('rejects a direct loop', () => {
    expect(canConnect([link('a', 'b')], 'b', 'a', 'input')).toBe(false)
  })

  it('rejects a loop through a longer chain, whatever the input', () => {
    const chain = [link('a', 'b', 'left'), link('b', 'c')]
    expect(canConnect(chain, 'c', 'a', 'other')).toBe(false)
  })

  it('allows fan-out and replacing the link feeding an input', () => {
    expect(canConnect([link('a', 'b'), link('a', 'c')], 'c', 'b', 'input')).toBe(true)
  })

  it('allows one source to feed two inputs of the same widget', () => {
    expect(canConnect([link('a', 'b', 'left')], 'a', 'b', 'right')).toBe(true)
  })
})

describe('sanitizeLinks', () => {
  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeLinks(undefined)).toEqual([])
    expect(sanitizeLinks({ from: 'a', to: 'b' })).toEqual([])
  })

  it('drops malformed entries, second links into one input and loops', () => {
    expect(
      sanitizeLinks([
        link('a', 'b', 'left'),
        { from: 'x' },
        null,
        link('c', 'b', 'left'),
        link('c', 'b', 'right'),
        link('b', 'a'),
        { ...link('b', 'd'), extra: true },
      ]),
    ).toEqual([link('a', 'b', 'left'), link('c', 'b', 'right'), link('b', 'd')])
  })

  it('maps links saved before inputs were declared to the `input` field', () => {
    expect(sanitizeLinks([{ from: 'a', to: 'b' }])).toEqual([link('a', 'b', 'input')])
  })
})

describe('linkKey', () => {
  it('identifies a link by target and input', () => {
    expect(linkKey(link('a', 'b', 'left'))).toBe('b:left')
  })
})

describe('autoLinkColor', () => {
  it('picks a stable color from the given palette', () => {
    const color = autoLinkColor('abc', DEFAULT_FLOW_COLORS)
    expect(DEFAULT_FLOW_COLORS).toContain(color)
    expect(autoLinkColor('abc', DEFAULT_FLOW_COLORS)).toBe(color)
  })
})

describe('linkColor', () => {
  it("uses the link's palette color, or falls back to its source's color", () => {
    expect(linkColor({ from: 'abc', color: 2 }, DEFAULT_FLOW_COLORS)).toBe(DEFAULT_FLOW_COLORS[2])
    expect(linkColor({ from: 'abc' }, DEFAULT_FLOW_COLORS)).toBe(autoLinkColor('abc', DEFAULT_FLOW_COLORS))
  })
})

describe('sanitizeLinks colors', () => {
  it('keeps a valid palette color and drops anything else', () => {
    expect(
      sanitizeLinks([
        { ...link('a', 'b'), color: 3 },
        { ...link('a', 'c'), color: 9 },
        { ...link('a', 'd'), color: '#fff' },
      ]),
    ).toEqual([{ ...link('a', 'b'), color: 3 }, link('a', 'c'), link('a', 'd')])
  })
})

describe('readableTextColor', () => {
  it('uses dark text on light colors and white text on dark ones', () => {
    expect(readableTextColor('#fde047')).toBe('#0f172a')
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff')
  })
})

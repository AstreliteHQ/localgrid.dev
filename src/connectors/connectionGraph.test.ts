import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONNECTOR_COLORS,
  canConnect,
  connectionColor,
  connectionKey,
  readableTextColor,
  sanitizeConnections,
} from './connectionGraph'

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

describe('sanitizeConnections', () => {
  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeConnections(undefined)).toEqual([])
    expect(sanitizeConnections({ from: 'a', to: 'b' })).toEqual([])
  })

  it('drops malformed entries, second links into one input and loops', () => {
    expect(
      sanitizeConnections([
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
    expect(sanitizeConnections([{ from: 'a', to: 'b' }])).toEqual([link('a', 'b', 'input')])
  })
})

describe('connectionKey', () => {
  it('identifies a link by target and input', () => {
    expect(connectionKey(link('a', 'b', 'left'))).toBe('b:left')
  })
})

describe('connectionColor', () => {
  it('picks a stable color from the given palette', () => {
    const color = connectionColor('abc', DEFAULT_CONNECTOR_COLORS)
    expect(DEFAULT_CONNECTOR_COLORS).toContain(color)
    expect(connectionColor('abc', DEFAULT_CONNECTOR_COLORS)).toBe(color)
  })
})

describe('readableTextColor', () => {
  it('uses dark text on light colors and white text on dark ones', () => {
    expect(readableTextColor('#fde047')).toBe('#0f172a')
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff')
  })
})

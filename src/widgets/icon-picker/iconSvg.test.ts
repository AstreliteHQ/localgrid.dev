import { describe, expect, it } from 'vitest'
import { buildIconSvg, clampPadding, iconFileName, searchIcons, toKebabName } from './iconSvg'

const STYLE = { color: '#000000', strokeWidth: 2, size: 24, padding: 0 }
const MARKUP = '<path d="M5 12h14"></path><circle cx="12" cy="12" r="10"></circle>'

describe('toKebabName', () => {
  it('splits PascalCase and digits the way Lucide names its files', () => {
    expect(toKebabName('ArrowDown')).toBe('arrow-down')
    expect(toKebabName('ALargeSmall')).toBe('a-large-small')
    expect(toKebabName('Grid2x2Check')).toBe('grid-2x2-check')
    expect(toKebabName('Axis3d')).toBe('axis-3d')
    expect(toKebabName('Clock10')).toBe('clock-10')
  })
})

describe('searchIcons', () => {
  const keys = ['ArrowDown', 'ArrowDownAZ', 'Heart', 'HeartCrack', 'MoveDown', 'Sparkles']

  it('returns every key for an empty query', () => {
    expect(searchIcons(keys, '  ')).toEqual(keys)
  })

  it('matches across separators and case', () => {
    expect(searchIcons(keys, 'arrow-down')).toEqual(['ArrowDown', 'ArrowDownAZ'])
    expect(searchIcons(keys, 'ArrowDown')).toEqual(['ArrowDown', 'ArrowDownAZ'])
    expect(searchIcons(keys, 'arrow down')).toEqual(['ArrowDown', 'ArrowDownAZ'])
  })

  it('ranks exact matches, then prefixes, then the rest', () => {
    expect(searchIcons(keys, 'down')).toEqual(['ArrowDown', 'ArrowDownAZ', 'MoveDown'])
    expect(searchIcons(['HeartCrack', 'Heart'], 'heart')).toEqual(['Heart', 'HeartCrack'])
    expect(searchIcons(['Heart', 'HeartCrack', 'BrokenHeart'], 'heart')).toEqual(['Heart', 'HeartCrack', 'BrokenHeart'])
  })

  it('requires every term', () => {
    expect(searchIcons(keys, 'heart crack')).toEqual(['HeartCrack'])
    expect(searchIcons(keys, 'heart zzz')).toEqual([])
  })
})

describe('buildIconSvg', () => {
  it('writes a standalone SVG with the chosen style', () => {
    const svg = buildIconSvg(MARKUP, { ...STYLE, color: '#ff0000', strokeWidth: 1.5, size: 48 })
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff0000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n' +
        '  <path d="M5 12h14" />\n' +
        '  <circle cx="12" cy="12" r="10" />\n' +
        '</svg>\n',
    )
  })

  it('widens the viewBox for padding, in output pixels', () => {
    // 64px output with 8px padding leaves 48px for the 24-unit icon, so
    // each px is half a unit and the padding is 4 units.
    const svg = buildIconSvg(MARKUP, { ...STYLE, size: 64, padding: 8 })
    expect(svg).toContain('viewBox="-4 -4 32 32"')
    expect(svg).toContain('width="64" height="64"')
  })

  it('keeps the icon visible when the padding is too large', () => {
    const svg = buildIconSvg(MARKUP, { ...STYLE, size: 16, padding: 100 })
    expect(svg).toContain('viewBox="-84 -84 192 192"')
  })

  it('clamps the size into range', () => {
    expect(buildIconSvg(MARKUP, { ...STYLE, size: 1 })).toContain('width="8"')
    expect(buildIconSvg(MARKUP, { ...STYLE, size: 5000 })).toContain('width="1024"')
  })

  it('starts from the icon’s own viewBox', () => {
    expect(buildIconSvg(MARKUP, STYLE, '0 0 32 32')).toContain('viewBox="0 0 32 32"')
  })
})

describe('clampPadding', () => {
  it('leaves at least one pixel for the icon', () => {
    expect(clampPadding(64, 8)).toBe(8)
    expect(clampPadding(64, 40)).toBe(31)
    expect(clampPadding(64, -3)).toBe(0)
  })
})

describe('iconFileName', () => {
  it('builds a safe file name', () => {
    expect(iconFileName('arrow-down', 'svg')).toBe('arrow-down.svg')
    expect(iconFileName('Bad name/..', 'png')).toBe('bad-name.png')
    expect(iconFileName('', 'png')).toBe('icon.png')
  })
})

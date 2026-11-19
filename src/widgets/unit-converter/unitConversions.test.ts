import { describe, expect, it } from 'vitest'
import {
  DATA_UNITS,
  LENGTH_UNITS,
  MASS_UNITS,
  TIME_UNITS,
  VOLUME_UNITS,
  convertLinear,
  convertRate,
  convertTemperature,
  supportsRate,
} from './unitConversions'

function unit(units: typeof LENGTH_UNITS, id: string) {
  const found = units.find((u) => u.id === id)
  if (!found) throw new Error(`no unit "${id}"`)
  return found
}

describe('convertLinear', () => {
  it('converts length', () => {
    const m = unit(LENGTH_UNITS, 'm')
    const km = unit(LENGTH_UNITS, 'km')
    expect(convertLinear(1500, m.toBase, km.toBase)).toBeCloseTo(1.5)
  })

  it('converts a known length reference value (1 mile in km)', () => {
    const mi = unit(LENGTH_UNITS, 'mi')
    const km = unit(LENGTH_UNITS, 'km')
    expect(convertLinear(1, mi.toBase, km.toBase)).toBeCloseTo(1.609344, 5)
  })

  it('converts mass', () => {
    const kg = unit(MASS_UNITS, 'kg')
    const lb = unit(MASS_UNITS, 'lb')
    expect(convertLinear(1, kg.toBase, lb.toBase)).toBeCloseTo(2.20462, 4)
  })

  it('converts volume', () => {
    const l = unit(VOLUME_UNITS, 'l')
    const gal = unit(VOLUME_UNITS, 'gal')
    expect(convertLinear(3.785411784, l.toBase, gal.toBase)).toBeCloseTo(1, 5)
  })

  it('converts data using decimal and binary prefixes', () => {
    const mb = unit(DATA_UNITS, 'MB')
    const b = unit(DATA_UNITS, 'B')
    expect(convertLinear(1, mb.toBase, b.toBase)).toBe(1_000_000)

    const mib = unit(DATA_UNITS, 'MiB')
    expect(convertLinear(1, mib.toBase, b.toBase)).toBe(1_048_576)
  })

  it('converts time', () => {
    const d = unit(TIME_UNITS, 'd')
    const h = unit(TIME_UNITS, 'h')
    expect(convertLinear(1, d.toBase, h.toBase)).toBeCloseTo(24)

    const wk = unit(TIME_UNITS, 'wk')
    const s = unit(TIME_UNITS, 's')
    expect(convertLinear(1, wk.toBase, s.toBase)).toBe(604800)
  })

  it('is its own inverse', () => {
    const ft = unit(LENGTH_UNITS, 'ft')
    const cm = unit(LENGTH_UNITS, 'cm')
    const converted = convertLinear(10, ft.toBase, cm.toBase)
    expect(convertLinear(converted, cm.toBase, ft.toBase)).toBeCloseTo(10, 6)
  })
})

describe('convertTemperature', () => {
  it('converts Celsius to Fahrenheit and back', () => {
    expect(convertTemperature(0, 'c', 'f')).toBe(32)
    expect(convertTemperature(100, 'c', 'f')).toBe(212)
    expect(convertTemperature(212, 'f', 'c')).toBeCloseTo(100)
  })

  it('converts Celsius to Kelvin', () => {
    expect(convertTemperature(0, 'c', 'k')).toBeCloseTo(273.15)
    expect(convertTemperature(-273.15, 'c', 'k')).toBeCloseTo(0)
  })

  it('converts Fahrenheit to Kelvin', () => {
    expect(convertTemperature(32, 'f', 'k')).toBeCloseTo(273.15)
  })

  it('is a no-op when converting a unit to itself', () => {
    expect(convertTemperature(37, 'c', 'c')).toBe(37)
  })
})

describe('convertRate', () => {
  function rate(units: typeof LENGTH_UNITS, id: string, perId: string) {
    return { toBase: unit(units, id).toBase, perToBase: unit(TIME_UNITS, perId).toBase }
  }

  it('converts km/h to m/s', () => {
    expect(convertRate(36, rate(LENGTH_UNITS, 'km', 'h'), rate(LENGTH_UNITS, 'm', 's'))).toBeCloseTo(10)
  })

  it('converts MB/s to GB/day', () => {
    expect(convertRate(1, rate(DATA_UNITS, 'MB', 's'), rate(DATA_UNITS, 'GB', 'd'))).toBeCloseTo(86.4)
  })

  it('converts L/min to gal/h', () => {
    expect(convertRate(1, rate(VOLUME_UNITS, 'l', 'min'), rate(VOLUME_UNITS, 'gal', 'h'))).toBeCloseTo(15.850323, 5)
  })

  it('matches a plain conversion when both sides share the same time unit', () => {
    const from = rate(MASS_UNITS, 'kg', 'h')
    const to = rate(MASS_UNITS, 'lb', 'h')
    expect(convertRate(1, from, to)).toBeCloseTo(convertLinear(1, from.toBase, to.toBase), 10)
  })
})

describe('supportsRate', () => {
  it('allows amount categories and leaves out time and temperature', () => {
    expect(supportsRate('length')).toBe(true)
    expect(supportsRate('data')).toBe(true)
    expect(supportsRate('time')).toBe(false)
    expect(supportsRate('temperature')).toBe(false)
  })
})

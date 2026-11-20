export interface UnitDefinition {
  id: string
  label: string
  /** Short display symbol shown next to a result, e.g. "km" or "GB". */
  symbol: string
  /** Multiplying a value in this unit by `toBase` gives the category's
   * base unit (meters, kilograms, liters, or bytes). */
  toBase: number
}

export const LENGTH_UNITS: UnitDefinition[] = [
  { id: 'mm', label: 'Millimeters', symbol: 'mm', toBase: 0.001 },
  { id: 'cm', label: 'Centimeters', symbol: 'cm', toBase: 0.01 },
  { id: 'm', label: 'Meters', symbol: 'm', toBase: 1 },
  { id: 'km', label: 'Kilometers', symbol: 'km', toBase: 1000 },
  { id: 'in', label: 'Inches', symbol: 'in', toBase: 0.0254 },
  { id: 'ft', label: 'Feet', symbol: 'ft', toBase: 0.3048 },
  { id: 'yd', label: 'Yards', symbol: 'yd', toBase: 0.9144 },
  { id: 'mi', label: 'Miles', symbol: 'mi', toBase: 1609.344 },
]

export const MASS_UNITS: UnitDefinition[] = [
  { id: 'mg', label: 'Milligrams', symbol: 'mg', toBase: 0.000001 },
  { id: 'g', label: 'Grams', symbol: 'g', toBase: 0.001 },
  { id: 'kg', label: 'Kilograms', symbol: 'kg', toBase: 1 },
  { id: 't', label: 'Metric tons', symbol: 't', toBase: 1000 },
  { id: 'oz', label: 'Ounces', symbol: 'oz', toBase: 0.028349523125 },
  { id: 'lb', label: 'Pounds', symbol: 'lb', toBase: 0.45359237 },
]

export const VOLUME_UNITS: UnitDefinition[] = [
  { id: 'ml', label: 'Milliliters', symbol: 'mL', toBase: 0.001 },
  { id: 'l', label: 'Liters', symbol: 'L', toBase: 1 },
  { id: 'tsp', label: 'Teaspoons (US)', symbol: 'tsp', toBase: 0.0049289216 },
  { id: 'tbsp', label: 'Tablespoons (US)', symbol: 'tbsp', toBase: 0.0147867648 },
  { id: 'cup', label: 'Cups (US)', symbol: 'cup', toBase: 0.2365882365 },
  { id: 'gal', label: 'Gallons (US)', symbol: 'gal', toBase: 3.785411784 },
]

export const DATA_UNITS: UnitDefinition[] = [
  { id: 'b', label: 'Bits', symbol: 'bit', toBase: 0.125 },
  { id: 'B', label: 'Bytes', symbol: 'B', toBase: 1 },
  { id: 'KB', label: 'Kilobytes', symbol: 'KB', toBase: 1000 },
  { id: 'MB', label: 'Megabytes', symbol: 'MB', toBase: 1000 ** 2 },
  { id: 'GB', label: 'Gigabytes', symbol: 'GB', toBase: 1000 ** 3 },
  { id: 'KiB', label: 'Kibibytes', symbol: 'KiB', toBase: 1024 },
  { id: 'MiB', label: 'Mebibytes', symbol: 'MiB', toBase: 1024 ** 2 },
  { id: 'GiB', label: 'Gibibytes', symbol: 'GiB', toBase: 1024 ** 3 },
]

export const TIME_UNITS: UnitDefinition[] = [
  { id: 'ms', label: 'Milliseconds', symbol: 'ms', toBase: 0.001 },
  { id: 's', label: 'Seconds', symbol: 's', toBase: 1 },
  { id: 'min', label: 'Minutes', symbol: 'min', toBase: 60 },
  { id: 'h', label: 'Hours', symbol: 'h', toBase: 3600 },
  { id: 'd', label: 'Days', symbol: 'd', toBase: 86400 },
  { id: 'wk', label: 'Weeks', symbol: 'wk', toBase: 604800 },
  { id: 'mo', label: 'Months (30 days)', symbol: 'mo', toBase: 2592000 },
  { id: 'yr', label: 'Years (365 days)', symbol: 'yr', toBase: 31536000 },
]

export type LinearCategoryId = 'length' | 'mass' | 'volume' | 'data' | 'time'

export const LINEAR_CATEGORIES: Record<LinearCategoryId, { label: string; units: UnitDefinition[] }> = {
  length: { label: 'Length', units: LENGTH_UNITS },
  mass: { label: 'Mass', units: MASS_UNITS },
  volume: { label: 'Volume', units: VOLUME_UNITS },
  data: { label: 'Data', units: DATA_UNITS },
  time: { label: 'Time', units: TIME_UNITS },
}

/** Converts between two units of the same category via their shared base
 * unit (e.g. meters, kilograms) — works for anything on a linear scale. */
export function convertLinear(value: number, fromToBase: number, toToBase: number): number {
  return (value * fromToBase) / toToBase
}

/** Converts a rate (an amount per unit of time, e.g. MB/s or km/h) by
 * converting the amount and the time denominator separately. */
export function convertRate(
  value: number,
  from: { toBase: number; perToBase: number },
  to: { toBase: number; perToBase: number },
): number {
  const perBaseTime = (value * from.toBase) / from.perToBase
  return (perBaseTime * to.perToBase) / to.toBase
}

/** Categories where an optional "per time" denominator makes sense. Time
 * per time is unitless, so the Time category itself is left out. */
export function supportsRate(category: string): category is Exclude<LinearCategoryId, 'time'> {
  return category === 'length' || category === 'mass' || category === 'volume' || category === 'data'
}

export type TemperatureUnitId = 'c' | 'f' | 'k'

export const TEMPERATURE_UNITS: { id: TemperatureUnitId; label: string; symbol: string }[] = [
  { id: 'c', label: 'Celsius', symbol: '°C' },
  { id: 'f', label: 'Fahrenheit', symbol: '°F' },
  { id: 'k', label: 'Kelvin', symbol: 'K' },
]

/** Temperature has no shared "zero" across scales, so — unlike the linear
 * categories — it needs real conversion formulas rather than a factor. */
export function convertTemperature(value: number, from: TemperatureUnitId, to: TemperatureUnitId): number {
  const celsius = from === 'c' ? value : from === 'f' ? ((value - 32) * 5) / 9 : value - 273.15
  if (to === 'c') return celsius
  if (to === 'f') return (celsius * 9) / 5 + 32
  return celsius + 273.15
}

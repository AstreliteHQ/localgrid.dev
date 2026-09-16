/** File size unit definitions and conversion, behind the File Size
 * Converter widget.
 *
 * Bytes are the base unit. Storage sizes come in two competing systems that
 * share names but not values: the decimal system (KB, MB, GB…) used by
 * storage vendors and most operating systems' "size on disk", built on
 * powers of 1000; and the binary system (KiB, MiB, GiB…) used by memory and
 * by some file managers, built on powers of 1024. A 1 TB drive reads as
 * "931 GiB" in a file manager for exactly this reason, and it's the single
 * most common source of file-size confusion, so the widget shows both
 * systems side by side rather than making the user pick one. */

export type UnitSystem = 'bit' | 'decimal' | 'binary'

export interface SizeUnit {
  id: string
  label: string
  system: UnitSystem
  /** Multiplying a value in this unit by `toBytes` gives bytes. */
  toBytes: number
}

export const BIT_UNIT: SizeUnit = { id: 'b', label: 'Bits', system: 'bit', toBytes: 1 / 8 }
export const BYTE_UNIT: SizeUnit = { id: 'B', label: 'Bytes', system: 'decimal', toBytes: 1 }

/** Decimal (SI) multiples: powers of 1000. What "GB" means on a product
 * spec sheet or a cloud storage bill. */
export const DECIMAL_UNITS: SizeUnit[] = [
  BYTE_UNIT,
  { id: 'KB', label: 'Kilobytes', system: 'decimal', toBytes: 1000 },
  { id: 'MB', label: 'Megabytes', system: 'decimal', toBytes: 1000 ** 2 },
  { id: 'GB', label: 'Gigabytes', system: 'decimal', toBytes: 1000 ** 3 },
  { id: 'TB', label: 'Terabytes', system: 'decimal', toBytes: 1000 ** 4 },
  { id: 'PB', label: 'Petabytes', system: 'decimal', toBytes: 1000 ** 5 },
]

/** Binary (IEC) multiples: powers of 1024. What "GiB" means, and what most
 * operating systems actually display when they say "GB". */
export const BINARY_UNITS: SizeUnit[] = [
  { id: 'KiB', label: 'Kibibytes', system: 'binary', toBytes: 1024 },
  { id: 'MiB', label: 'Mebibytes', system: 'binary', toBytes: 1024 ** 2 },
  { id: 'GiB', label: 'Gibibytes', system: 'binary', toBytes: 1024 ** 3 },
  { id: 'TiB', label: 'Tebibytes', system: 'binary', toBytes: 1024 ** 4 },
  { id: 'PiB', label: 'Pebibytes', system: 'binary', toBytes: 1024 ** 5 },
]

/** Every unit the widget can convert between or from, bit included. Used
 * for the "from" picker and for looking up a unit by id. */
export const ALL_UNITS: SizeUnit[] = [BIT_UNIT, ...DECIMAL_UNITS, ...BINARY_UNITS]

export function findUnit(id: string): SizeUnit | undefined {
  return ALL_UNITS.find((unit) => unit.id === id)
}

/** Converts a value from `unit` into bytes. Negative sizes are not
 * physically meaningful, but nothing here rejects them: a widget deep in a
 * dashboard is as likely to be used for "how many MB is a 3.5 KB delta" as
 * for an actual file, and refusing the sign would just be friction. */
export function toBytes(value: number, unit: SizeUnit): number {
  return value * unit.toBytes
}

export function fromBytes(bytes: number, unit: SizeUnit): number {
  return bytes / unit.toBytes
}

/** Parses free-form numeric input, accepting a leading `+`/`-`, thousands
 * commas, and surrounding whitespace. Returns `null` rather than `NaN` for
 * anything else, so the widget can tell "empty" and "invalid" apart from a
 * genuine zero. */
export function parseSize(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  const withoutCommas = trimmed.replace(/,/g, '')
  const value = Number(withoutCommas)
  return Number.isFinite(value) ? value : null
}

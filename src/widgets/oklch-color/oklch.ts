import { colord, extend, type Colord } from 'colord'
import namesPlugin from 'colord/plugins/names'
import oklabPlugin from 'colord/plugins/oklab'
import oklchPlugin from 'colord/plugins/oklch'

extend([namesPlugin, oklabPlugin, oklchPlugin])

/** An OKLCH color as the widget edits it: `l` from 0 to 1, `c` from 0 (in
 * practice below 0.4), `h` in degrees, `alpha` from 0 to 1. Kept apart
 * from colord on purpose: colord stores every color as clamped sRGB, so it
 * cannot hold a color outside sRGB, which is half the point of OKLCH. */
export interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

/** Upper end of the chroma slider. Every color in sRGB and Display P3 fits
 * below it, as in CSS Color 4, where `100%` chroma means 0.4. */
export const MAX_CHROMA = 0.4

const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`
const ANGLE_UNITS: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }

function channel(unit: string) {
  return String.raw`(${NUMBER}${unit}|none)`
}

const OKLCH_PATTERN = new RegExp(
  String.raw`^oklch\(\s*${channel('%?')}\s+${channel('%?')}\s+${channel('(?:deg|grad|rad|turn)?')}\s*(?:\/\s*${channel('%?')}\s*)?\)$`,
  'i',
)
const OKLAB_PATTERN = new RegExp(
  String.raw`^oklab\(\s*${channel('%?')}\s+${channel('%?')}\s+${channel('%?')}\s*(?:\/\s*${channel('%?')}\s*)?\)$`,
  'i',
)

/** Reads a CSS channel: `none` is 0, a percentage is scaled to `percentOf`. */
function readChannel(raw: string | undefined, percentOf: number, fallback = 0): number {
  if (raw === undefined) return fallback
  if (raw.toLowerCase() === 'none') return 0
  if (raw.endsWith('%')) return (Number(raw.slice(0, -1)) / 100) * percentOf
  return Number(raw)
}

function readHue(raw: string): number {
  if (raw.toLowerCase() === 'none') return 0
  const match = /^(.*?)(deg|grad|rad|turn)?$/i.exec(raw)!
  return Number(match[1]) * ANGLE_UNITS[(match[2] ?? 'deg').toLowerCase()]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const normalizeHue = (h: number) => ((h % 360) + 360) % 360

function normalize({ l, c, h, alpha }: Oklch): Oklch {
  return { l: clamp(l, 0, 1), c: Math.max(0, c), h: normalizeHue(h), alpha: clamp(alpha, 0, 1) }
}

function fromOklab(l: number, a: number, b: number, alpha: number): Oklch {
  const c = Math.hypot(a, b)
  // Below this, hue is powerless (CSS Color 4) and atan2 only returns noise.
  const h = c < 1e-6 ? 0 : (Math.atan2(b, a) * 180) / Math.PI
  return normalize({ l, c, h, alpha })
}

/** Parses any color the widget accepts: `oklch()` and `oklab()` are read
 * here so a color outside sRGB keeps its real chroma; hex, `rgb()`,
 * `hsl()`, named colors and the rest go through colord. */
export function parseColor(input: string): Oklch | null {
  const value = input.trim()
  if (!value) return null

  const lch = OKLCH_PATTERN.exec(value)
  if (lch) {
    const parsed = {
      l: readChannel(lch[1], 1),
      c: readChannel(lch[2], MAX_CHROMA),
      h: readHue(lch[3]),
      alpha: readChannel(lch[4], 1, 1),
    }
    return Object.values(parsed).every(Number.isFinite) ? normalize(parsed) : null
  }

  const lab = OKLAB_PATTERN.exec(value)
  if (lab) {
    const [l, a, b, alpha] = [
      readChannel(lab[1], 1),
      readChannel(lab[2], MAX_CHROMA),
      readChannel(lab[3], MAX_CHROMA),
      readChannel(lab[4], 1, 1),
    ]
    if (![l, a, b, alpha].every(Number.isFinite)) return null
    const color = fromOklab(l, a, b, alpha)
    // Huge but finite a and b can still overflow to an infinite chroma,
    // which would never settle in the gamut mapping search.
    return Number.isFinite(color.c) ? color : null
  }

  const parsed = colord(value)
  if (!parsed.isValid()) return null
  const { l, c, h, a } = parsed.toOklch()
  return normalize({ l, c, h: c < 1e-4 ? 0 : h, alpha: a })
}

/** Rounds to at most `digits` decimals, dropping trailing zeros. */
function round(value: number, digits: number): number {
  return Number(value.toFixed(digits)) + 0
}

function alphaSuffix(alpha: number): string {
  return alpha < 1 ? ` / ${round(alpha, 3)}` : ''
}

export function formatOklch({ l, c, h, alpha }: Oklch): string {
  return `oklch(${round(l * 100, 2)}% ${round(c, 4)} ${round(h, 2)}${alphaSuffix(alpha)})`
}

export function toOklab({ l, c, h }: Oklch): { l: number; a: number; b: number } {
  const rad = (h * Math.PI) / 180
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) }
}

export function formatOklab(color: Oklch): string {
  const { l, a, b } = toOklab(color)
  return `oklab(${round(l * 100, 2)}% ${round(a, 4)} ${round(b, 4)}${alphaSuffix(color.alpha)})`
}

export type Vec3 = [number, number, number]

function multiply(m: number[][], [x, y, z]: Vec3): Vec3 {
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z,
    m[1][0] * x + m[1][1] * y + m[1][2] * z,
    m[2][0] * x + m[2][1] * y + m[2][2] * z,
  ]
}

// OKLab to linear sRGB, from Björn Ottosson's reference implementation.
const OKLAB_TO_LMS = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
]
const LMS_TO_LINEAR_SRGB = [
  [4.076741636075958, -3.3077115392580616, 0.2309699031821043],
  [-1.2684379732850317, 2.6097573492876887, -0.3413193760026573],
  [-0.0041960761386756, -0.7034186179359363, 1.7076146940746117],
]
// Linear sRGB to linear Display P3 (both D65), through CIE XYZ.
const LINEAR_SRGB_TO_LINEAR_P3 = [
  [0.8224621209, 0.1775378791, 0],
  [0.0331941989, 0.9668058011, 0],
  [0.0170826307, 0.0723974407, 0.9105199286],
]

export function toLinearSrgb(color: Oklch): Vec3 {
  const { l, a, b } = toOklab(color)
  const lms = multiply(OKLAB_TO_LMS, [l, a, b]).map((v) => v ** 3) as Vec3
  return multiply(LMS_TO_LINEAR_SRGB, lms)
}

/** Channels may land a hair outside [0, 1] from rounding alone: colord
 * rounds OKLCH to 4 or 5 decimals, so `#ff0000` read back lands up to about
 * 2e-4 past the edge. That is far below one 8-bit step and not worth a
 * warning. */
const GAMUT_EPSILON = 4e-4

export function inUnitCube(channels: Vec3): boolean {
  return channels.every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON)
}

export function isInSrgb(color: Oklch): boolean {
  return inUnitCube(toLinearSrgb(color))
}

export function linearSrgbToLinearP3(channels: Vec3): Vec3 {
  return multiply(LINEAR_SRGB_TO_LINEAR_P3, channels)
}

export function isInP3(color: Oklch): boolean {
  return inUnitCube(linearSrgbToLinearP3(toLinearSrgb(color)))
}

/** The sRGB transfer function, which Display P3 shares. */
export function encodeSrgb(v: number): number {
  const sign = v < 0 ? -1 : 1
  const abs = Math.abs(v)
  return sign * (abs > 0.0031308 ? 1.055 * abs ** (1 / 2.4) - 0.055 : 12.92 * abs)
}

function decodeSrgb(v: number): number {
  return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92
}

/** Clips each gamma-encoded sRGB channel to [0, 1], then reads the result
 * back as OKLCH. */
function clipToSrgb(color: Oklch): Oklch {
  const encoded = toLinearSrgb(color).map((v) => clamp(encodeSrgb(v), 0, 1))
  const linear = encoded.map(decodeSrgb) as Vec3
  const lms = [
    0.412221469470763 * linear[0] + 0.5363325372617348 * linear[1] + 0.0514459932675022 * linear[2],
    0.2119034958178252 * linear[0] + 0.6806995506452344 * linear[1] + 0.1073969535369406 * linear[2],
    0.0883024591900564 * linear[0] + 0.2817188391361215 * linear[1] + 0.6299787016738222 * linear[2],
  ].map(Math.cbrt)
  const l = 0.210454268309314 * lms[0] + 0.7936177747023054 * lms[1] - 0.0040720430116193 * lms[2]
  const a = 1.9779985324311684 * lms[0] - 2.42859224204858 * lms[1] + 0.450593709617411 * lms[2]
  const b = 0.0259040424655478 * lms[0] + 0.7827717124575296 * lms[1] - 0.8086757549230774 * lms[2]
  const result = fromOklab(l, a, b, color.alpha)
  return result.c < 1e-6 ? { ...result, h: color.h } : result
}

function deltaEOK(first: Oklch, second: Oklch): number {
  const x = toOklab(first)
  const y = toOklab(second)
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}

/** Brings a color into sRGB with the CSS Color 4 gamut mapping algorithm:
 * keep lightness and hue, lower chroma until clipping the rest changes the
 * color by less than a just noticeable difference. */
export function toSrgbGamut(color: Oklch): Oklch {
  if (color.l >= 1) return { l: 1, c: 0, h: color.h, alpha: color.alpha }
  if (color.l <= 0) return { l: 0, c: 0, h: color.h, alpha: color.alpha }
  if (isInSrgb(color)) return color

  const JND = 0.02
  const EPSILON = 0.0001
  let clipped = clipToSrgb(color)
  if (deltaEOK(clipped, color) < JND) return clipped

  let min = 0
  let max = color.c
  let minInGamut = true
  while (max - min > EPSILON) {
    const current = { ...color, c: (min + max) / 2 }
    if (minInGamut && isInSrgb(current)) {
      min = current.c
      continue
    }
    clipped = clipToSrgb(current)
    const delta = deltaEOK(clipped, current)
    if (delta < JND) {
      if (JND - delta < EPSILON) break
      minInGamut = false
      min = current.c
    } else {
      max = current.c
    }
  }
  return clipped
}

/** The color as colord sees it, mapped into sRGB first, for the sRGB
 * formats (hex, `rgb()`, `hsl()`). */
export function toSrgbColord(color: Oklch): Colord {
  const { l, c, h, alpha } = toSrgbGamut(color)
  return colord({ l, c, h, a: alpha, ok: true })
}

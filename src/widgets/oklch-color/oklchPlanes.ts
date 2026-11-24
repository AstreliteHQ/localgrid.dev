import { MAX_CHROMA, encodeSrgb, linearSrgbToLinearP3, type Oklch } from './oklch'

type Channel = 'l' | 'c' | 'h'

/** One chart: a slice through OKLCH that holds one channel at the current
 * color's value and spreads the other two over the x and y axes, as on
 * oklch.com. */
export interface PlaneSpec {
  /** The channel held fixed. */
  fixed: Channel
  x: Channel
  y: Channel
}

export const PLANES: PlaneSpec[] = [
  { fixed: 'l', x: 'h', y: 'c' },
  { fixed: 'c', x: 'h', y: 'l' },
  { fixed: 'h', x: 'l', y: 'c' },
]

export const CHANNEL_NAMES: Record<Channel, string> = { l: 'Lightness', c: 'Chroma', h: 'Hue' }

const RANGES: Record<Channel, number> = { l: 1, c: MAX_CHROMA, h: 360 }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Columns of the linear sRGB to linear P3 matrix, read off its basis vectors. */
const P3_COLUMNS = [linearSrgbToLinearP3([1, 0, 0]), linearSrgbToLinearP3([0, 1, 0]), linearSrgbToLinearP3([0, 0, 1])]

/** The color under a point of a plane. `x` and `y` run from 0 to 1, with
 * `y` measured from the bottom edge. */
export function colorAt(plane: PlaneSpec, base: Oklch, x: number, y: number): Oklch {
  return { ...base, [plane.x]: clamp01(x) * RANGES[plane.x], [plane.y]: clamp01(y) * RANGES[plane.y] }
}

/** Where a color sits on a plane, from 0 to 1 on each axis (`y` from the
 * bottom). Chroma above the chart's range is pinned to the top. */
export function positionOf(plane: PlaneSpec, color: Oklch): { x: number; y: number } {
  return { x: clamp01(color[plane.x] / RANGES[plane.x]), y: clamp01(color[plane.y] / RANGES[plane.y]) }
}

export const GAMUT_SRGB = 0
export const GAMUT_P3 = 1
export const GAMUT_NONE = 2

export interface PlaneImage {
  /** RGBA pixels, row by row from the top, for `ImageData`. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  /** The gamut of each pixel (`GAMUT_*`), same order. */
  gamuts: Uint8Array
}

const clampUnit = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)
/** Gamma encoding through a lookup table: `Math.pow` per channel per pixel
 * was most of the render time. 4096 steps is finer than 8-bit output. */
const LUT_SIZE = 4096
const ENCODE_LUT = Uint8ClampedArray.from({ length: LUT_SIZE + 1 }, (_, i) =>
  Math.round(encodeSrgb(i / LUT_SIZE) * 255),
)
const to8bit = (linear: number) => ENCODE_LUT[Math.round(clampUnit(linear) * LUT_SIZE)]
/** Tighter than the widget's own gamut check: that one forgives rounding in
 * typed colors, but near black every channel is that small, and a loose
 * tolerance there paints out-of-gamut speckles at the bottom of the charts. */
const EPSILON = 1e-6
const inside = (r: number, g: number, b: number) =>
  r >= -EPSILON && r <= 1 + EPSILON && g >= -EPSILON && g <= 1 + EPSILON && b >= -EPSILON && b <= 1 + EPSILON

/** Channel values along one axis, sampled at pixel centers. */
function axisValues(channel: Channel, count: number, fromBottom: boolean): Float64Array {
  const values = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    values[i] = (fromBottom ? 1 - t : t) * RANGES[channel]
  }
  return values
}

/**
 * Paints a plane at `width` x `height` pixels. Colors outside Display P3 are
 * left transparent. Colors between sRGB and P3 are painted in the canvas's
 * own space: a P3 canvas shows them as they are, an sRGB one clips them.
 * The sRGB edge is drawn as a thin line on its inner side, in black or
 * white depending on the lightness under it.
 *
 * This runs for every pixel on every change, so the color math from
 * `oklch.ts` is inlined here without intermediate objects.
 */
export function renderPlane(
  plane: PlaneSpec,
  base: Oklch,
  width: number,
  height: number,
  canvasSpace: 'srgb' | 'display-p3',
): PlaneImage {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const gamuts = new Uint8Array(width * height)
  const lightness = new Float32Array(width * height)
  const xs = axisValues(plane.x, width, false)
  const ys = axisValues(plane.y, height, true)
  const p3 = canvasSpace === 'display-p3'
  const [c0, c1, c2] = P3_COLUMNS
  const xIsL = plane.x === 'l'
  const xIsC = plane.x === 'c'
  const yIsL = plane.y === 'l'
  const yIsC = plane.y === 'c'

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col
      const x = xs[col]
      const y = ys[row]
      const l = xIsL ? x : yIsL ? y : base.l
      const c = xIsC ? x : yIsC ? y : base.c
      const h = plane.x === 'h' ? x : plane.y === 'h' ? y : base.h
      const rad = (h * Math.PI) / 180
      const a = c * Math.cos(rad)
      const b = c * Math.sin(rad)
      const lmsL = (l + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3
      const lmsM = (l - 0.1055613458156586 * a - 0.0638541728258133 * b) ** 3
      const lmsS = (l - 0.0894841775298119 * a - 1.2914855480194092 * b) ** 3
      const r = 4.076741636075958 * lmsL - 3.3077115392580616 * lmsM + 0.2309699031821043 * lmsS
      const g = -1.2684379732850317 * lmsL + 2.6097573492876887 * lmsM - 0.3413193760026573 * lmsS
      const bl = -0.0041960761386756 * lmsL - 0.7034186179359363 * lmsM + 1.7076146940746117 * lmsS
      const pr = c0[0] * r + c1[0] * g + c2[0] * bl
      const pg = c0[1] * r + c1[1] * g + c2[1] * bl
      const pb = c0[2] * r + c1[2] * g + c2[2] * bl
      const gamut = inside(r, g, bl) ? GAMUT_SRGB : inside(pr, pg, pb) ? GAMUT_P3 : GAMUT_NONE
      gamuts[index] = gamut
      lightness[index] = l
      if (gamut === GAMUT_NONE) continue
      const offset = index * 4
      pixels[offset] = to8bit(p3 ? pr : r)
      pixels[offset + 1] = to8bit(p3 ? pg : g)
      pixels[offset + 2] = to8bit(p3 ? pb : bl)
      pixels[offset + 3] = 255
    }
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col
      if (gamuts[index] !== GAMUT_SRGB) continue
      const onEdge =
        (col > 0 && gamuts[index - 1] !== GAMUT_SRGB) ||
        (col < width - 1 && gamuts[index + 1] !== GAMUT_SRGB) ||
        (row > 0 && gamuts[index - width] !== GAMUT_SRGB) ||
        (row < height - 1 && gamuts[index + width] !== GAMUT_SRGB)
      if (!onEdge) continue
      const offset = index * 4
      const ink = lightness[index] > 0.65 ? 0 : 255
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(pixels[offset + channel] * 0.3 + ink * 0.7)
      }
    }
  }

  return { pixels, gamuts }
}

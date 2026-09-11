import { colord, extend, type Colord } from 'colord'
import mixPlugin from 'colord/plugins/mix'

// Registers Colord#mix, used below to blend the seed color toward white/black.
extend([mixPlugin])

export const TONE_NAMES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const
export const ACCENT_NAMES = ['A100', 'A200', 'A400', 'A700'] as const

export type ToneName = (typeof TONE_NAMES)[number]
export type AccentName = (typeof ACCENT_NAMES)[number]

/** How far each light tone (50-400) is mixed toward white, in RGB space.
 * 500 is the seed color itself, unmixed. */
const TINT_RATIOS: Record<string, number> = {
  '50': 0.92,
  '100': 0.76,
  '200': 0.56,
  '300': 0.36,
  '400': 0.16,
}

/** How far each dark tone (600-900) is mixed toward black, in RGB space. */
const SHADE_RATIOS: Record<string, number> = {
  '600': 0.12,
  '700': 0.24,
  '800': 0.36,
  '900': 0.48,
}

/** HSL lightness (0-100) for each accent tone, from lightest/most vivid to
 * darkest/most vivid. */
const ACCENT_LIGHTNESS: Record<AccentName, number> = {
  A100: 75,
  A200: 65,
  A400: 55,
  A700: 45,
}

/** Accents are boosted to at least this HSL saturation so a muted or
 * grayscale seed still produces punchy accent colors. */
const ACCENT_MIN_SATURATION = 85

export interface PaletteSwatch {
  name: string
  hex: string
  /** Whichever of black/white reads better on top of `hex`, for label text. */
  foreground: '#000000' | '#ffffff'
}

export interface MaterialPalette {
  base: string
  tones: PaletteSwatch[]
  accents: PaletteSwatch[]
}

function toSwatch(name: string, color: Colord): PaletteSwatch {
  const hex = color.toHex()
  return { name, hex, foreground: colord(hex).isDark() ? '#ffffff' : '#000000' }
}

function toneColor(base: Colord, tone: ToneName): Colord {
  if (tone === '500') return base
  if (tone in TINT_RATIOS) return base.mix('#ffffff', TINT_RATIOS[tone], 'rgb')
  return base.mix('#000000', SHADE_RATIOS[tone], 'rgb')
}

function accentColor(base: Colord, tone: AccentName): Colord {
  const { h, s, a } = base.toHsl()
  return colord({ h, s: Math.max(s, ACCENT_MIN_SATURATION), l: ACCENT_LIGHTNESS[tone], a })
}

/** Generates a Material Design style 50-900 tonal scale plus A100-A700
 * accents from a single seed color. `500` is always the seed color itself;
 * lighter/darker tones are mixed toward white/black in RGB space, and
 * accents boost saturation at a few fixed lightness levels. This is a
 * simple RGB/HSL approximation of Google's classic Material Design palette
 * shape, not the CAM16/HCT tonal system Material 3 derives its palettes
 * from. Returns `null` for a seed that doesn't parse as a color. */
export function generateMaterialPalette(seed: string): MaterialPalette | null {
  const base = colord(seed)
  if (!base.isValid()) return null

  return {
    base: base.toHex(),
    tones: TONE_NAMES.map((name) => toSwatch(name, toneColor(base, name))),
    accents: ACCENT_NAMES.map((name) => toSwatch(name, accentColor(base, name))),
  }
}

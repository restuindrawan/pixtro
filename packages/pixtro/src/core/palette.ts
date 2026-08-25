import type { Described, Palette, RGB, RGBA } from './types.ts'

/**
 * Palette construction.
 *
 * The one rule that separates hand-picked pixel art from generated mush:
 * shadows do not just get darker, they shift *toward a cool hue*, and
 * highlights shift *toward a warm hue*. A naive `lerp(color, black)` ramp
 * always reads as muddy no matter how carefully you tune the lightness.
 */

/** Cool anchor shadows bend toward (blue-violet). */
const SHADOW_HUE = 265
/** Warm anchor highlights bend toward (yellow). */
const HIGHLIGHT_HUE = 50
const SHADOW_HUE_PULL = 0.16
const HIGHLIGHT_HUE_PULL = 0.18

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * Rotate `hue` a fraction of the way toward `target`, taking the shorter way
 * around the wheel. Direction-agnostic, so it does the right thing for greens
 * (shadows go teal) and reds (shadows go magenta) without special cases.
 */
function shiftToward(hue: number, target: number, amount: number): number {
  const delta = (((target - hue + 540) % 360) - 180) * amount
  return hue + delta
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp01(s)
  const light = clamp01(l)
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

export type HSL = readonly [h: number, s: number, l: number]

const opaque = (rgb: RGB): RGBA => [rgb[0], rgb[1], rgb[2], 255]

/** Build a three-step shadow/base/highlight ramp from one base color. */
export function ramp([h, s, l]: HSL): [RGBA, RGBA, RGBA] {
  const shadow = hslToRgb(
    shiftToward(h, SHADOW_HUE, SHADOW_HUE_PULL),
    Math.min(s * 1.14, 1),
    l * 0.55,
  )
  const base = hslToRgb(h, s, l)
  const highlight = hslToRgb(
    shiftToward(h, HIGHLIGHT_HUE, HIGHLIGHT_HUE_PULL),
    s * 0.8,
    l + (1 - l) * 0.44,
  )
  return [opaque(shadow), opaque(base), opaque(highlight)]
}

export type PaletteSpec = Described &
  (
    | { readonly kind: 'ramp'; readonly body: HSL; readonly accent: HSL }
    | { readonly kind: 'fixed'; readonly colors: Palette }
  )

const hex = (s: string): RGBA => [
  Number.parseInt(s.slice(1, 3), 16),
  Number.parseInt(s.slice(3, 5), 16),
  Number.parseInt(s.slice(5, 7), 16),
  255,
]

const TRANSPARENT: RGBA = [0, 0, 0, 0]

export function buildPalette(spec: PaletteSpec): Palette {
  if (spec.kind === 'fixed') return spec.colors

  const [h, s, l] = spec.body
  const [bodyShadow, bodyBase, bodyHighlight] = ramp(spec.body)
  const [accShadow, accBase, accHighlight] = ramp(spec.accent)

  // Outline and ink borrow the body hue so the silhouette never looks like it
  // was cut out of a different image. Ink is darker so the face wins attention.
  const outline = opaque(hslToRgb(shiftToward(h, SHADOW_HUE, 0.3), s * 0.7, l * 0.2))
  const ink = opaque(hslToRgb(shiftToward(h, SHADOW_HUE, 0.3), s * 0.55, l * 0.11))
  const white = opaque(hslToRgb(h, 0.22, 0.95))

  return [
    TRANSPARENT,
    outline,
    bodyShadow,
    bodyBase,
    bodyHighlight,
    accShadow,
    accBase,
    accHighlight,
    ink,
    white,
  ]
}

/** Classic four-tone DMG green, mapped so both ramps share the same tones. */
const GAMEBOY: Palette = [
  TRANSPARENT,
  hex('#0f380f'),
  hex('#306230'),
  hex('#8bac0f'),
  hex('#9bbc0f'),
  hex('#0f380f'),
  hex('#306230'),
  hex('#8bac0f'),
  hex('#0f380f'),
  hex('#9bbc0f'),
]

export const PALETTES = {
  /** Warm terracotta over a cool blue accent. The house style. */
  ember: {
    kind: 'ramp',
    body: [18, 0.62, 0.57],
    accent: [206, 0.44, 0.54],
    tags: ['warm', 'orange', 'terracotta', 'fire', 'ember', 'rust', 'sunset', 'clay'],
  },
  moss: {
    kind: 'ramp',
    body: [128, 0.38, 0.46],
    accent: [42, 0.68, 0.6],
    tags: ['green', 'moss', 'forest', 'nature', 'leaf', 'earthy', 'olive', 'plant'],
  },
  dusk: {
    kind: 'ramp',
    body: [268, 0.42, 0.55],
    accent: [330, 0.6, 0.62],
    tags: ['purple', 'violet', 'dusk', 'magic', 'night', 'mystic', 'wizard', 'arcane'],
  },
  sea: {
    kind: 'ramp',
    body: [192, 0.5, 0.52],
    accent: [40, 0.72, 0.62],
    tags: ['blue', 'sea', 'ocean', 'water', 'cool', 'sky', 'aqua', 'frost'],
  },
  sand: {
    kind: 'ramp',
    body: [38, 0.58, 0.66],
    accent: [250, 0.4, 0.55],
    tags: ['sand', 'tan', 'desert', 'gold', 'beige', 'honey', 'wheat', 'dune'],
  },
  rose: {
    kind: 'ramp',
    body: [342, 0.55, 0.66],
    accent: [172, 0.44, 0.5],
    tags: ['pink', 'rose', 'blossom', 'sweet', 'candy', 'cute', 'bubblegum'],
  },
  ash: {
    kind: 'ramp',
    body: [214, 0.14, 0.56],
    accent: [20, 0.6, 0.58],
    tags: ['grey', 'gray', 'ash', 'stone', 'metal', 'silver', 'steel', 'robot'],
  },
  gameboy: {
    kind: 'fixed',
    colors: GAMEBOY,
    tags: ['gameboy', 'retro', 'handheld', 'dmg', 'classic', 'nostalgic', 'lime'],
  },
} as const satisfies Record<string, PaletteSpec>

export type PaletteName = keyof typeof PALETTES

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]

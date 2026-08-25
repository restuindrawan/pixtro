/**
 * Core data model.
 *
 * The whole engine works on *palette slot indices*, never on colors. Parts are
 * authored as slot indices, composed as slot indices, and only turn into RGBA
 * at the very last step. That is what lets any part work with any palette for
 * free, and what lets the GIF encoder take our buffer verbatim.
 */

/** Every sprite is rendered on this square grid at native resolution. */
export const CANVAS = 32

export const SLOT = {
  /** Nothing drawn here. Always fully transparent. */
  empty: 0,
  /** Dark tinted body outline. Never pure black. */
  outline: 1,
  shadow: 2,
  base: 3,
  highlight: 4,
  /** Second ramp, used by accessories so they read as a separate material. */
  accentShadow: 5,
  accentBase: 6,
  accentHighlight: 7,
  /** Facial features. Darker than `outline` so eyes stay the focal point. */
  ink: 8,
  /** Tinted white for eye shine. */
  white: 9,
} as const

export type Slot = (typeof SLOT)[keyof typeof SLOT]

/** Authoring alphabet. Index into this string === slot value. */
export const SLOT_CHARS = '.osbhSBHiw'

export type Point = { readonly x: number; readonly y: number }

/** A composed sprite: one slot index per pixel, row-major. */
export type Grid = {
  readonly w: number
  readonly h: number
  readonly px: Uint8Array
}

/** Decoded pixels ready for an encoder or a canvas. */
export type Image = {
  readonly w: number
  readonly h: number
  /**
   * Pinned to `ArrayBuffer` rather than the default `ArrayBufferLike`, because
   * the DOM `ImageData` constructor rejects a possibly-shared buffer. Without
   * this, every browser caller would need a cast.
   */
  readonly data: Uint8ClampedArray<ArrayBuffer>
}

export type RGB = readonly [number, number, number]
export type RGBA = readonly [number, number, number, number]

/** Exactly ten entries, one per `SLOT`. */
export type Palette = readonly RGBA[]

/** Where on the body a part attaches. */
export type AnchorName = 'face' | 'mouth' | 'top'

/**
 * Metadata every part and palette carries.
 *
 * Both live on the part itself rather than in a separate table so that a
 * user-supplied part arrives complete — it brings its own roll weight and its
 * own prompt vocabulary, and nothing central has to be edited to accept it.
 */
export type Described = {
  /**
   * Words a prompt can match against. Include synonyms and the moods a part
   * evokes, not just what it literally is.
   */
  readonly tags?: readonly string[]
  /**
   * Relative likelihood when rolling from a seed. Defaults to 1.
   * `0` means never rolled — reachable only by an explicit override or a
   * storyboard part swap, which is how the `blink` eyes stay out of the pool.
   */
  readonly weight?: number
}

export type Part = Described & {
  readonly w: number
  readonly h: number
  /** `h` strings of `w` characters each, drawn from `SLOT_CHARS`. */
  readonly px: readonly string[]
  readonly anchor: AnchorName
  /**
   * `top` puts the part's top edge on the anchor, `bottom` puts its bottom edge
   * there. Accessories use `bottom` so they sit on the head no matter how tall
   * they are.
   */
  readonly align?: 'top' | 'bottom'
  readonly dx?: number
  readonly dy?: number
}

export type Body = Described & {
  readonly w: number
  readonly h: number
  readonly px: readonly string[]
  /** Top-left placement on the canvas. */
  readonly x: number
  readonly y: number
  readonly anchors: Readonly<Record<AnchorName, Point>>
}

/**
 * The four drawable slots. These are also the keys of a `PartLibrary` and of
 * `Traits`, deliberately — one vocabulary means no translation layer between
 * the registry, the genome, and an animation track.
 */
export const PART_SLOTS = ['body', 'eyes', 'mouth', 'accessory'] as const

export type PartSlot = (typeof PART_SLOTS)[number]

/** What an animation track can change about a slot at one moment. */
export type Pose = {
  readonly dx?: number
  readonly dy?: number
  /** Swap in a different part from the same slot, e.g. eyes → `blink`. */
  readonly part?: string
  readonly hidden?: boolean
}

/** A track target. `all` moves the whole sprite together. */
export type PoseTarget = PartSlot | 'all'

export const POSE_TARGETS = ['all', ...PART_SLOTS] as const

export type PoseSet = Partial<Record<PoseTarget, Pose>>

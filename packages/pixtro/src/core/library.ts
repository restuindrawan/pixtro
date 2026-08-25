import { PALETTES, type PaletteSpec } from './palette.ts'
import { ACCESSORIES, BODIES, EYES, MOUTHS } from './parts/index.ts'
import {
  type AnchorName,
  type Body,
  CANVAS,
  type Described,
  PART_SLOTS,
  type Part,
  type PartSlot,
  SLOT_CHARS,
} from './types.ts'

/**
 * Everything the engine can draw, as data.
 *
 * Keys match `Traits` and animation track targets exactly, so there is no
 * translation layer anywhere between the registry, a genome, and a storyboard.
 */
export type PartLibrary = {
  readonly body: Readonly<Record<string, Body>>
  readonly eyes: Readonly<Record<string, Part>>
  readonly mouth: Readonly<Record<string, Part>>
  readonly accessory: Readonly<Record<string, Part>>
  readonly palette: Readonly<Record<string, PaletteSpec>>
}

export type TraitSlot = keyof PartLibrary

export const TRAIT_SLOTS = [...PART_SLOTS, 'palette'] as const satisfies readonly TraitSlot[]

export const DEFAULT_LIBRARY: PartLibrary = {
  body: BODIES,
  eyes: EYES,
  mouth: MOUTHS,
  accessory: ACCESSORIES,
  palette: PALETTES,
}

/** Names in a slot that the seed roll is allowed to choose. */
export function rollableNames(library: PartLibrary, slot: TraitSlot): string[] {
  return Object.entries(library[slot])
    .filter(([, entry]) => ((entry as Described).weight ?? 1) > 0)
    .map(([name]) => name)
}

export function names(library: PartLibrary, slot: TraitSlot): string[] {
  return Object.keys(library[slot])
}

// --- validation -------------------------------------------------------------
//
// Custom parts arrive from a file the engine has never seen, so bad input is
// expected rather than exceptional. Every failure names the exact part, the
// exact row, and what was wrong with it — a silent misdraw is much harder to
// diagnose than a thrown error at load time.

export class LibraryError extends Error {
  override name = 'LibraryError'
}

const fail = (where: string, message: string): never => {
  throw new LibraryError(`${where}: ${message}`)
}

function validatePixels(where: string, part: { w: number; h: number; px: readonly string[] }) {
  if (!Number.isInteger(part.w) || part.w < 0) fail(where, `w must be a non-negative integer`)
  if (!Number.isInteger(part.h) || part.h < 0) fail(where, `h must be a non-negative integer`)
  if (part.px.length !== part.h) {
    fail(where, `declares h=${part.h} but has ${part.px.length} rows`)
  }
  part.px.forEach((row, index) => {
    if (row.length !== part.w) {
      fail(where, `row ${index} is ${row.length} characters, expected w=${part.w}`)
    }
    for (const char of row) {
      if (!SLOT_CHARS.includes(char)) {
        fail(where, `row ${index} contains "${char}", which is not one of ${SLOT_CHARS}`)
      }
    }
  })
  if ((part as Described).weight !== undefined) {
    const weight = (part as Described).weight as number
    if (!(weight >= 0) || !Number.isFinite(weight)) fail(where, `weight must be >= 0`)
  }
}

export function validateBody(name: string, body: Body): void {
  const where = `body "${name}"`
  validatePixels(where, body)
  if (body.x < 0 || body.y < 0 || body.x + body.w > CANVAS || body.y + body.h > CANVAS) {
    fail(where, `is placed outside the ${CANVAS}×${CANVAS} canvas`)
  }
  for (const [anchor, point] of Object.entries(body.anchors)) {
    if (point.x < 0 || point.x >= CANVAS || point.y < 0 || point.y >= CANVAS) {
      fail(where, `anchor "${anchor}" at (${point.x}, ${point.y}) is off-canvas`)
    }
  }
  for (const required of ['face', 'mouth', 'top'] as const) {
    if (!body.anchors[required]) fail(where, `is missing the "${required}" anchor`)
  }
}

export function validatePart(slot: PartSlot, name: string, part: Part): void {
  const where = `${slot} "${name}"`
  validatePixels(where, part)
  if (!['face', 'mouth', 'top'].includes(part.anchor)) {
    fail(where, `anchor "${part.anchor}" is not one of face, mouth, top`)
  }
}

export function validateLibrary(library: PartLibrary): void {
  for (const slot of TRAIT_SLOTS) {
    if (!library[slot] || typeof library[slot] !== 'object') {
      throw new LibraryError(`library is missing the "${slot}" slot`)
    }
    if (Object.keys(library[slot]).length === 0) {
      throw new LibraryError(`library slot "${slot}" is empty — supply at least one ${slot}`)
    }
    if (rollableNames(library, slot).length === 0) {
      throw new LibraryError(
        `library slot "${slot}" has no rollable entries — every entry has weight 0`,
      )
    }
  }
  for (const [name, body] of Object.entries(library.body)) validateBody(name, body)
  for (const slot of ['eyes', 'mouth', 'accessory'] as const) {
    for (const [name, part] of Object.entries(library[slot])) validatePart(slot, name, part)
  }
}

/**
 * Build a library by layering additions over a base, slot by slot.
 *
 * Merging per slot rather than replacing wholesale is what makes "one extra
 * hat" a three-line file instead of a fork of the entire default set. Passing
 * an entry whose name already exists overrides that entry.
 */
export function defineLibrary(
  additions: Partial<{ [S in TraitSlot]: Readonly<Record<string, PartLibrary[S][string]>> }> = {},
  base: PartLibrary = DEFAULT_LIBRARY,
): PartLibrary {
  const merged = {
    body: { ...base.body, ...additions.body },
    eyes: { ...base.eyes, ...additions.eyes },
    mouth: { ...base.mouth, ...additions.mouth },
    accessory: { ...base.accessory, ...additions.accessory },
    palette: { ...base.palette, ...additions.palette },
  } as PartLibrary
  validateLibrary(merged)
  return merged
}

/** Start from nothing instead of layering onto the built-ins. */
export function defineLibraryFromScratch(library: PartLibrary): PartLibrary {
  validateLibrary(library)
  return library
}

const blank = (anchor: AnchorName): Part => ({ w: 0, h: 0, px: [], anchor, tags: [], weight: 1 })

/**
 * A base with no art in it, for building a library entirely out of parts drawn
 * at runtime: `defineLibrary(additions, EMPTY_BASE)`.
 *
 * The three attachable slots carry an empty `none`, because "no mouth" is a
 * design choice rather than missing art — a mascot can legitimately have no
 * mouth, no eyes and no hat. `body` is deliberately left empty instead, so the
 * result stays *invalid* until a body arrives. That failure is the point: it is
 * what tells a caller drawing from scratch that it has not drawn anything yet,
 * rather than silently rendering a blank canvas.
 *
 * Palettes come along because they are color, not shape, and nothing can be
 * rendered without one.
 */
export const EMPTY_BASE: PartLibrary = {
  body: {},
  eyes: { none: blank('face') },
  mouth: { none: blank('mouth') },
  accessory: { none: blank('top') },
  palette: PALETTES,
}

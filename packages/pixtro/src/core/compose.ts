import type { Genome } from './genome.ts'
import { DEFAULT_LIBRARY, type PartLibrary } from './library.ts'
import {
  type Body,
  CANVAS,
  type Grid,
  PART_SLOTS,
  type Part,
  type PartSlot,
  type Pose,
  type PoseSet,
  SLOT_CHARS,
} from './types.ts'

const SLOT_BY_CHAR = new Map<string, number>([...SLOT_CHARS].map((char, slot) => [char, slot]))

function slotOf(char: string, partLabel: string): number {
  const slot = SLOT_BY_CHAR.get(char)
  if (slot === undefined) {
    throw new Error(`${partLabel}: "${char}" is not a slot character (${SLOT_CHARS})`)
  }
  return slot
}

/** Stamp a rectangle of slot indices onto the grid, skipping transparent pixels. */
function blit(grid: Grid, px: readonly string[], x0: number, y0: number, label: string): void {
  for (let row = 0; row < px.length; row++) {
    const line = px[row]
    if (line === undefined) continue
    const y = y0 + row
    if (y < 0 || y >= grid.h) continue
    for (let col = 0; col < line.length; col++) {
      const x = x0 + col
      if (x < 0 || x >= grid.w) continue
      const slot = slotOf(line[col] as string, label)
      if (slot === 0) continue
      grid.px[y * grid.w + x] = slot
    }
  }
}

/**
 * Resolve a part's top-left position from the body it attaches to.
 *
 * Horizontal placement centers on the anchor. Vertically, `align: 'bottom'`
 * measures up from the anchor instead of down, which is what lets a 3px halo
 * and a 6px hat both sit correctly on the same head.
 */
function place(body: Body, part: Part): { x: number; y: number } {
  const anchor = body.anchors[part.anchor]
  const top = part.align === 'bottom' ? anchor.y - part.h : anchor.y
  return {
    x: anchor.x - (part.w >> 1) + (part.dx ?? 0),
    y: top + (part.dy ?? 0),
  }
}

export type ComposeOptions = {
  readonly library?: PartLibrary
  /**
   * Per-slot animation state. The `all` target offsets the whole sprite; a
   * per-slot entry stacks on top of it.
   */
  readonly poses?: PoseSet
}

const EMPTY: Pose = {}

/**
 * Genome -> indexed grid. No colors involved; this is the format the renderer
 * and the GIF encoder both consume.
 */
export function compose(genome: Genome, options: ComposeOptions = {}): Grid {
  const library = options.library ?? DEFAULT_LIBRARY
  const poses = options.poses ?? {}
  const grid: Grid = { w: CANVAS, h: CANVAS, px: new Uint8Array(CANVAS * CANVAS) }

  const all = poses.all ?? EMPTY
  const globalX = all.dx ?? 0
  const globalY = all.dy ?? 0
  if (all.hidden) return grid

  const bodyName = poses.body?.part ?? genome.body
  const body = library.body[bodyName]
  if (!body) {
    throw new Error(`unknown body "${bodyName}" — have: ${Object.keys(library.body).join(', ')}`)
  }

  const bodyPose = poses.body ?? EMPTY
  if (!bodyPose.hidden) {
    blit(
      grid,
      body.px,
      body.x + globalX + (bodyPose.dx ?? 0),
      body.y + globalY + (bodyPose.dy ?? 0),
      `body:${bodyName}`,
    )
  }

  // Accessories go on after the body so a crown can cut into the head outline,
  // and before the face so nothing can ever cover the eyes.
  const order: Exclude<PartSlot, 'body'>[] = ['accessory', 'eyes', 'mouth']
  for (const slot of order) {
    const pose = poses[slot] ?? EMPTY
    if (pose.hidden) continue
    const name = pose.part ?? genome[slot]
    const part = library[slot][name]
    if (!part) {
      throw new Error(`unknown ${slot} "${name}" — have: ${Object.keys(library[slot]).join(', ')}`)
    }
    if (part.h === 0) continue
    const at = place(body, part)
    blit(
      grid,
      part.px,
      at.x + globalX + (pose.dx ?? 0),
      at.y + globalY + (pose.dy ?? 0),
      `${slot}:${name}`,
    )
  }

  return grid
}

/** Every slot a pose set may address, for callers that need to enumerate them. */
export const COMPOSE_SLOTS = PART_SLOTS

/** Nearest-neighbour scale on the *index* grid, before any color is applied. */
export function upscale(grid: Grid, factor: number): Grid {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new Error(`scale must be a positive integer, got ${factor}`)
  }
  if (factor === 1) return grid
  const w = grid.w * factor
  const h = grid.h * factor
  const px = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const srcRow = Math.floor(y / factor) * grid.w
    for (let x = 0; x < w; x++) {
      px[y * w + x] = grid.px[srcRow + Math.floor(x / factor)] as number
    }
  }
  return { w, h, px }
}

import type { Part } from '../types.ts'

/**
 * Accessories. One slot only — two competing props on a 32px sprite turn the
 * silhouette to noise.
 *
 * These use the accent ramp (`S`/`B`/`H`) rather than the body ramp so they
 * read as a separate material regardless of which palette is applied.
 *
 * All of them are `align: 'bottom'` against the `top` anchor with a small `dy`,
 * which sinks them into the head so they look worn rather than balanced on top.
 */

const none: Part = {
  tags: ['plain', 'bare', 'simple', 'nothing', 'clean', 'minimal'],
  weight: 5,
  anchor: 'top',
  w: 0,
  h: 0,
  px: [],
}

/** Bobble on a stem. Odd width so the stem lands dead center. */
const antenna: Part = {
  tags: ['antenna', 'robot', 'bot', 'android', 'machine', 'alien', 'signal', 'radio'],
  weight: 2,
  anchor: 'top',
  w: 5,
  h: 6,
  align: 'bottom',
  dy: 2,
  px: ['.ooo.', 'oHBBo', 'oBBSo', '.ooo.', '..o..', '..o..'],
}

/** Three points on a band. Only `dy: 1` — sink it further and the band vanishes. */
const crown: Part = {
  tags: ['crown', 'king', 'queen', 'royal', 'regal', 'ruler', 'noble', 'prince', 'princess'],
  weight: 1,
  anchor: 'top',
  w: 11,
  h: 4,
  align: 'bottom',
  dy: 1,
  px: ['.o...o...o.', 'oHo.oHo.oHo', 'oHHHBBBBBBo', 'ooooooooooo'],
}

/** Floats clear of the head, so this one gets a negative `dy`. */
const halo: Part = {
  tags: ['halo', 'angel', 'saint', 'holy', 'divine', 'blessed', 'pure', 'ghost', 'spirit'],
  weight: 1,
  anchor: 'top',
  w: 9,
  h: 3,
  align: 'bottom',
  dy: -1,
  px: ['..ooooo..', '.oHHHHHo.', '..ooooo..'],
}

/**
 * Tall cone with a two-row brim.
 *
 * `dy: 2` matters: at `dy: 1` the brim lands exactly on the body's own top
 * outline row and disappears into it. Sinking one row further puts the brim
 * across the head where it reads as a hat rather than a party cone.
 */
const hat: Part = {
  tags: ['hat', 'wizard', 'witch', 'mage', 'sorcerer', 'magic', 'pointed', 'spell', 'cone'],
  weight: 1,
  anchor: 'top',
  w: 13,
  h: 8,
  align: 'bottom',
  dy: 2,
  px: [
    '......o......',
    '.....oHo.....',
    '....oHHBo....',
    '....oHHBo....',
    '...oHHBBBo...',
    '..oHHBBBBBo..',
    'oHHHBBBBBBBBo',
    'ooooooooooooo',
  ],
}

/**
 * A domed helm with a brow band. Stops above the eyes on every body rather than
 * covering them: accessories are drawn before the face, so a visor low enough
 * to cross the eye line would just be hidden by them, and on a body whose face
 * sits lower it would land on a forehead instead.
 */
const helm: Part = {
  tags: [
    'helm',
    'helmet',
    'knight',
    'armor',
    'armour',
    'paladin',
    'soldier',
    'guard',
    'crusader',
    'steel',
    'visor',
  ],
  weight: 1,
  anchor: 'top',
  w: 13,
  h: 6,
  align: 'bottom',
  dy: 2,
  px: [
    '....ooooo....',
    '..ooHHHBBoo..',
    '.oHHHHBBBBSo.',
    'oHHHHBBBBBSSo',
    'oHHHBBBBBBSSo',
    'ooooooooooooo',
  ],
}

export const ACCESSORIES = { none, antenna, crown, halo, hat, helm } as const

export type AccessoryName = keyof typeof ACCESSORIES

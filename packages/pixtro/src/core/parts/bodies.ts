import type { Body } from '../types.ts'

/**
 * Bodies. Authored as plain text so they diff in a pull request.
 *
 *   .  transparent      S  accent shadow
 *   o  outline          B  accent base
 *   s  body shadow      H  accent highlight
 *   b  body base        i  ink (facial features)
 *   h  body highlight   w  tinted white
 *
 * Light comes from the upper left, so highlights hug the top-left curve and
 * shadows pool along the lower right. Keep that consistent across every body
 * or the set stops looking like one family.
 *
 * `anchors` are canvas coordinates, not part-local ones, so faces and hats land
 * in the right place without every part knowing the body's dimensions.
 */

/** Wide, bottom-heavy egg. The default silhouette. */
const blob: Body = {
  tags: ['blob', 'round', 'soft', 'plump', 'egg', 'bubble', 'friendly', 'chubby'],
  weight: 3,
  w: 22,
  h: 20,
  x: 5,
  y: 10,
  anchors: {
    face: { x: 16, y: 18 },
    mouth: { x: 16, y: 23 },
    top: { x: 16, y: 10 },
  },
  px: [
    '........oooooo........',
    '......oohhhhbboo......',
    '....oohhhhbbbbbboo....',
    '...ohhhhbbbbbbbbbbo...',
    '..ohhhhbbbbbbbbbbbso..',
    '.ohhhhbbbbbbbbbbbbsso.',
    '.ohhhhbbbbbbbbbbbbsso.',
    'ohhhhbbbbbbbbbbbbbssso',
    'ohhhbbbbbbbbbbbbbbssso',
    'ohhhbbbbbbbbbbbbbbssso',
    'ohhhbbbbbbbbbbbbbsssso',
    'ohhhbbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbbssssso',
    'ohhbbbbbbbbbbbbbssssso',
    'ohbbbbbbbbbbbbbsssssso',
    '.ohbbbbbbbbbbbsssssso.',
    '.obbbbbbbbbbsssssssso.',
    '..oobbbbssssssssssoo..',
    '....oooooooooooooo....',
  ],
}

/** Narrow capsule. Reads as a different character, not a stretched blob. */
const tall: Body = {
  tags: ['tall', 'capsule', 'narrow', 'slim', 'long', 'pill', 'lanky', 'thin'],
  weight: 2,
  w: 16,
  h: 24,
  x: 8,
  y: 6,
  anchors: {
    face: { x: 16, y: 14 },
    mouth: { x: 16, y: 19 },
    top: { x: 16, y: 6 },
  },
  px: [
    '.....oooooo.....',
    '...oohhhbbboo...',
    '..ohhhbbbbbbbo..',
    '.ohhhbbbbbbbbso.',
    '.ohhhbbbbbbbsso.',
    // The shadow band narrows through the face rows so the right eye lands on
    // base color instead of straddling the terminator.
    'ohhhbbbbbbbbbsso',
    'ohhhbbbbbbbbbsso',
    'ohhhbbbbbbbbbsso',
    'ohhbbbbbbbbbbsso',
    'ohhbbbbbbbbbbsso',
    'ohhbbbbbbbbbssso',
    'ohhbbbbbbbbbssso',
    'ohbbbbbbbbbsssso',
    'ohbbbbbbbbbsssso',
    'ohbbbbbbbbssssso',
    'ohbbbbbbbbssssso',
    'obbbbbbbbbssssso',
    'obbbbbbbbbssssso',
    'obbbbbbbbsssssso',
    'obbbbbbbssssssso',
    'obbbbbssssssssso',
    '.obbbssssssssso.',
    '..oobsssssssoo..',
    '....oooooooo....',
  ],
}

/** A short, wide loaf. Horizontal mass; reads as stout and grounded. */
const loaf: Body = {
  tags: ['loaf', 'wide', 'squat', 'bread', 'brick', 'chunky', 'stout', 'grounded', 'cat'],
  weight: 2,
  w: 26,
  h: 16,
  x: 3,
  y: 14,
  anchors: {
    face: { x: 16, y: 20 },
    mouth: { x: 16, y: 25 },
    top: { x: 16, y: 14 },
  },
  px: [
    '......oooooooooooooo......',
    '....oohhhhbbbbbbbbbbboo...',
    '..oohhhhbbbbbbbbbbbbbbboo.',
    '.ohhhhbbbbbbbbbbbbbbbbbbso',
    'ohhhhbbbbbbbbbbbbbbbbbbsso',
    'ohhhbbbbbbbbbbbbbbbbbbssso',
    'ohhhbbbbbbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbbbbbbbsssso',
    'ohbbbbbbbbbbbbbbbbbbssssso',
    'ohbbbbbbbbbbbbbbbbbbssssso',
    'obbbbbbbbbbbbbbbbbbsssssso',
    'obbbbbbbbbbbbbbbbsssssssso',
    '.obbbbbbbbbbbbbsssssssssso',
    '..oobbbbbbbbsssssssssssoo.',
    '....oooooooooooooooooooo..',
  ],
}

/**
 * Teardrop. The point at the top is the whole identity, so the `top` anchor
 * sits a few rows below it where the taper is wide enough to wear a hat.
 */
const drop: Body = {
  tags: ['drop', 'teardrop', 'ghost', 'spirit', 'drip', 'rain', 'spooky', 'flame', 'wisp'],
  weight: 2,
  w: 20,
  h: 24,
  x: 6,
  y: 5,
  anchors: {
    face: { x: 16, y: 16 },
    mouth: { x: 16, y: 21 },
    top: { x: 16, y: 8 },
  },
  px: [
    '.........oo.........',
    '........ohho........',
    '.......ohhhbo.......',
    '......ohhhbbbo......',
    '.....ohhhbbbbbo.....',
    '....ohhhbbbbbbbo....',
    '...ohhhbbbbbbbbso...',
    '..ohhhbbbbbbbbbsso..',
    '..ohhbbbbbbbbbbsso..',
    '.ohhbbbbbbbbbbbssso.',
    '.ohhbbbbbbbbbbbssso.',
    '.ohhbbbbbbbbbbbssso.',
    'ohhbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbsssso',
    'ohbbbbbbbbbbbbbsssso',
    'ohbbbbbbbbbbbbbsssso',
    'ohbbbbbbbbbbbbssssso',
    'ohbbbbbbbbbbbbssssso',
    '.obbbbbbbbbbbssssso.',
    '.obbbbbbbbbbsssssso.',
    '..obbbbbbbbsssssso..',
    '...oobbbbssssssoo...',
    '.....oooooooooo.....',
  ],
}

/** Boxy with rounded corners. The one non-organic silhouette in the set. */
const cube: Body = {
  tags: ['cube', 'box', 'square', 'block', 'boxy', 'robot', 'tv', 'crate', 'machine', 'solid'],
  weight: 2,
  w: 20,
  h: 20,
  x: 6,
  y: 10,
  anchors: {
    face: { x: 16, y: 17 },
    mouth: { x: 16, y: 22 },
    top: { x: 16, y: 10 },
  },
  px: [
    '..oooooooooooooooo..',
    '.ohhhhhhhhhhhhbbbso.',
    'ohhhhbbbbbbbbbbbbsso',
    'ohhhbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbsssso',
    'ohbbbbbbbbbbbbbsssso',
    'ohbbbbbbbbbbbbssssso',
    'obbbbbbbbbbbbbssssso',
    '.obbbbbbbbbbsssssso.',
    '..oooooooooooooooo..',
  ],
}

/** Narrow head, wide base. The face sits high, in the narrow part. */
const pear: Body = {
  tags: ['pear', 'bottom-heavy', 'plump', 'fruit', 'chonky', 'heavy', 'wobbly', 'pudgy'],
  weight: 2,
  w: 22,
  h: 22,
  x: 5,
  y: 8,
  anchors: {
    face: { x: 16, y: 13 },
    mouth: { x: 16, y: 18 },
    // Two rows below the tip: the tip is 6px wide, and a hat brim that lands
    // there overhangs into empty air and reads as a floating jaw line.
    top: { x: 16, y: 10 },
  },
  px: [
    '........oooooo........',
    '......oohhhhbboo......',
    '.....ohhhhbbbbbbo.....',
    '.....ohhhbbbbbbbso....',
    '.....ohhhbbbbbbbso....',
    '.....ohhbbbbbbbbso....',
    '....ohhhbbbbbbbbbso...',
    '....ohhbbbbbbbbbsso...',
    '...ohhhbbbbbbbbbbsso..',
    '..ohhhbbbbbbbbbbbssso.',
    '.ohhhbbbbbbbbbbbbssso.',
    '.ohhbbbbbbbbbbbbbssso.',
    'ohhbbbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbbssssso',
    'ohbbbbbbbbbbbbbbssssso',
    'ohbbbbbbbbbbbbbsssssso',
    'ohbbbbbbbbbbbbbsssssso',
    '.obbbbbbbbbbbbsssssso.',
    '.obbbbbbbbbbbssssssso.',
    '..oobbbbbbssssssssoo..',
    '....oooooooooooooo....',
  ],
}

/**
 * A puddle with a peak. Deliberately asymmetric — the mass drips to the right,
 * so it is the one body whose silhouette is not mirror-symmetric.
 */
const slime: Body = {
  tags: ['slime', 'puddle', 'goo', 'gooey', 'melty', 'jelly', 'ooze', 'splat', 'lazy', 'flat'],
  weight: 2,
  w: 26,
  h: 14,
  x: 3,
  y: 16,
  anchors: {
    face: { x: 16, y: 21 },
    mouth: { x: 16, y: 26 },
    top: { x: 15, y: 19 },
  },
  px: [
    '...........oo.............',
    '..........ohho............',
    '.........ohhhbo...........',
    '........ohhhbbbo..........',
    '.....ooohhhbbbbbooo.......',
    '...oohhhhhbbbbbbbbboo.....',
    '..ohhhhbbbbbbbbbbbbbbo....',
    '.ohhhbbbbbbbbbbbbbbbbso...',
    'ohhhbbbbbbbbbbbbbbbbbsso..',
    'ohhbbbbbbbbbbbbbbbbbbssso.',
    'ohhbbbbbbbbbbbbbbbbbsssso.',
    'ohbbbbbbbbbbbbbbbbbbssssso',
    '.obbbbbbbbbbbbbbbsssssssso',
    '..oooooooooooooooooooooo..',
  ],
}

/**
 * A person: big head, small torso, arms, legs.
 *
 * The only body that is not one closed mass, and the only one that uses the
 * accent ramp (`S`/`B`/`H`) for part of itself — the head is skin on the body
 * ramp, everything below the chin is clothing on the accent ramp. That split is
 * what makes a figure read as dressed rather than as a bare silhouette, and it
 * means an accent-ramp accessory (a helm, a crown) matches the outfit in every
 * palette for free.
 *
 * Proportions are chibi — a 15px head over a 14px body — on purpose. Eyes are
 * 9-11px wide and center on `face`, so a realistically-proportioned 8px head
 * simply cannot wear the face parts every other body uses. Two heads tall keeps
 * the whole existing set of eyes, mouths and hats working unchanged, and the
 * odd width is what lets them center exactly.
 */
const hero: Body = {
  tags: [
    'hero',
    'knight',
    'human',
    'person',
    'man',
    'woman',
    'guy',
    'figure',
    'humanoid',
    'character',
    'warrior',
    'adventurer',
    'soldier',
    'kid',
    'standing',
    'brave',
  ],
  weight: 1,
  w: 17,
  h: 26,
  x: 8,
  y: 5,
  anchors: {
    face: { x: 16, y: 9 },
    mouth: { x: 16, y: 13 },
    top: { x: 16, y: 6 },
  },
  px: [
    '.....ooooooo.....',
    '...oohhhhbbboo...',
    '..ohhhhbbbbbbbo..',
    '.ohhhhbbbbbbbbso.',
    '.ohhhbbbbbbbbbso.',
    '.ohhhbbbbbbbbbso.',
    '.ohhbbbbbbbbbbso.',
    '.ohhbbbbbbbbbsso.',
    '.ohbbbbbbbbbbsso.',
    '.ohbbbbbbbbbbsso.',
    '..obbbbbbbbbbso..',
    '...oooobbsoooo...',
    '......obbso......',
    '...ooooHHBoooo...',
    '.oooHHHBBBBSSooo.',
    '.oHoHHHBBBBSSoSo.',
    '.oHoHHBBBBBSSoSo.',
    '.oHoHHBBBBBSSoSo.',
    '.oHoHBBBBBBSSoSo.',
    '.oooHBBBBBBSSooo.',
    '...oHBBBBBBSSo...',
    '..oHHBBBBBBBSSo..',
    '..oHHBBoooBBSSo..',
    '..oHHBBo.oBBSSo..',
    '..oHHBBo.oBBSSo..',
    '..oooooo.oooooo..',
  ],
}

export const BODIES = { blob, tall, loaf, drop, cube, pear, slime, hero } as const

export type BodyName = keyof typeof BODIES

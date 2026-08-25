import type { Part } from '../types.ts'

/**
 * Eyes and mouths. Every expression this engine can make lives here.
 *
 * The restraint is deliberate: a friendly blob mascot carries almost all of its
 * expression in the eyes, and adding a mouth usually makes it read as goofier
 * and less calm. That is why `none` is the most heavily weighted mouth.
 *
 * All face parts are horizontally symmetrical and odd-width so they center
 * cleanly on the face anchor.
 */

/** Two square pips. Neutral and alert. */
const dot: Part = {
  tags: ['dot', 'simple', 'neutral', 'plain', 'alert', 'beady', 'small'],
  weight: 3,
  anchor: 'face',
  w: 9,
  h: 2,
  px: ['ii.....ii', 'ii.....ii'],
}

/** Taller pips. Softer, slightly younger read. */
const oval: Part = {
  tags: ['oval', 'wide', 'big', 'soft', 'young', 'curious', 'innocent'],
  weight: 3,
  anchor: 'face',
  w: 9,
  h: 3,
  px: ['ii.....ii', 'ii.....ii', 'ii.....ii'],
}

/** Lowered lids with a downward lash. Calm, half-asleep. */
const sleepy: Part = {
  tags: ['sleepy', 'tired', 'drowsy', 'calm', 'relaxed', 'zen', 'serene', 'bored', 'lazy'],
  weight: 2,
  anchor: 'face',
  w: 11,
  h: 2,
  dy: 1,
  px: ['iii.....iii', '.i.......i.'],
}

/** Ovals with a single shine pixel top-left, matching the body light source. */
const sparkle: Part = {
  tags: ['sparkle', 'shiny', 'excited', 'happy', 'bright', 'starry', 'hopeful', 'wonder'],
  weight: 2,
  anchor: 'face',
  w: 9,
  h: 3,
  px: ['wi.....wi', 'ii.....ii', 'ii.....ii'],
}

/**
 * Closed. `weight: 0` keeps it out of the seed roll — it exists so storyboards
 * can swap it in for a blink, and so an override can pin it deliberately.
 */
const blink: Part = {
  tags: ['blink', 'closed', 'shut', 'asleep', 'resting'],
  weight: 0,
  anchor: 'face',
  w: 9,
  h: 1,
  dy: 1,
  px: ['ii.....ii'],
}

export const EYES = { dot, oval, sleepy, sparkle, blink } as const

export type EyesName = keyof typeof EYES

const none: Part = {
  tags: ['quiet', 'calm', 'minimal', 'blank', 'serene', 'stoic', 'mysterious'],
  weight: 4,
  anchor: 'mouth',
  w: 0,
  h: 0,
  px: [],
}

/** Small upturned curve. The corners sit a pixel above the middle. */
const smile: Part = {
  tags: ['smile', 'happy', 'friendly', 'cheerful', 'grin', 'joy', 'warm', 'pleased'],
  weight: 3,
  anchor: 'mouth',
  w: 5,
  h: 2,
  px: ['i...i', '.iii.'],
}

/** Flat line. Deadpan. */
const line: Part = {
  tags: ['line', 'deadpan', 'flat', 'neutral', 'serious', 'unimpressed', 'grumpy'],
  weight: 2,
  anchor: 'mouth',
  w: 3,
  h: 1,
  px: ['iii'],
}

export const MOUTHS = { none, smile, line } as const

export type MouthName = keyof typeof MOUTHS

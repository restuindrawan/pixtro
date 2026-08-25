/**
 * An example custom part library.
 *
 *   pixtro gen --library ./examples/my-parts.ts --accessory tophat
 *   pixtro gen --library ./examples/my-parts.ts --prompt "a dapper angry ghost"
 *   pixtro sheet --library ./examples/my-parts.ts -n 24 -o sheet.png
 *
 * Export only the slots you are adding — they get layered onto the built-ins,
 * so this file does not have to restate the default parts. Export a complete
 * library (every slot present) instead if you want to replace them outright.
 * Reusing a built-in name (say, `body: { loaf }`) overrides that part.
 *
 * The `tags` are what make a part reachable from `--prompt`. They cost nothing
 * and they are the only way the interpreter learns your vocabulary.
 */
import type { Part } from '../src/core/index.ts'

const tophat: Part = {
  tags: ['tophat', 'formal', 'dapper', 'gentleman', 'fancy', 'posh'],
  weight: 2,
  anchor: 'top',
  w: 13,
  h: 6,
  align: 'bottom',
  dy: 2,
  // The brim is a *colored* row between two outline rows. An all-outline brim
  // disappears into the body's own outline and the hat reads as a chimney.
  px: [
    '....ooooo....',
    '....oHHBo....',
    '....oHHBo....',
    '....oHHBo....',
    'oHHHBBBBBBBBo',
    'ooooooooooooo',
  ],
}

/** Angry slanted brows. Odd width so it centers on the face anchor. */
const cross: Part = {
  tags: ['cross', 'angry', 'mad', 'furious', 'annoyed', 'stern'],
  weight: 2,
  anchor: 'face',
  w: 11,
  h: 3,
  px: ['ii.......ii', '.ii.....ii.', '.ii.....ii.'],
}

export default {
  eyes: { cross },
  accessory: { tophat },
  palette: {
    /** Custom palettes are ramp specs, and they take tags too. */
    ink: {
      kind: 'ramp',
      body: [230, 0.3, 0.4],
      accent: [12, 0.7, 0.6],
      tags: ['ink', 'navy', 'midnight', 'deep', 'formal'],
    },
  },
} as const

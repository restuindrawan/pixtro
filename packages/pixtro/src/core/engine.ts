import { type ComposeOptions, compose, upscale } from './compose.ts'
import { type Genome, generate, type Traits, validateGenome } from './genome.ts'
import { type Interpretation, interpret, seedFromPrompt } from './interpret.ts'
import {
  DEFAULT_LIBRARY,
  names,
  type PartLibrary,
  rollableNames,
  type TraitSlot,
} from './library.ts'
import { buildPalette } from './palette.ts'
import { toAscii, toRGBA } from './render.ts'
import {
  getStory,
  type Storyboard,
  type StoryName,
  sampleStory,
  storyDuration,
  validateStory,
} from './story.ts'
import type { Grid, Image, Palette } from './types.ts'

export type Frame = { readonly grid: Grid; readonly ms: number }

export type RenderOptions = {
  /** Integer nearest-neighbour multiplier, applied before colorization. */
  readonly scale?: number
  readonly poses?: ComposeOptions['poses']
}

/**
 * An engine bound to one part library.
 *
 * Binding beats threading a `library` argument through `generate`, `compose`,
 * `render`, and every story call: forgetting it in one place would silently mix
 * a custom genome with the default parts, and the failure would surface as a
 * wrong picture rather than an error.
 */
export type Engine = {
  readonly library: PartLibrary

  generate(seed: string, overrides?: Partial<Traits>): Genome
  /** Prompt in, mascot out. Unpinned slots come from a seed derived from the prompt. */
  fromPrompt(prompt: string, overrides?: Partial<Traits>): Genome
  interpret(prompt: string): Interpretation

  compose(genome: Genome, options?: RenderOptions): Grid
  paletteFor(genome: Genome): Palette
  render(genome: Genome, options?: RenderOptions): Image
  toAscii(genome: Genome, options?: RenderOptions): string

  /** Flatten a storyboard into frames, ready for a GIF encoder or a canvas. */
  renderStory(genome: Genome, story: StoryName | Storyboard, options?: RenderOptions): Frame[]
  storyDuration(story: StoryName | Storyboard): number

  /** Every name in a slot, and only those the seed roll may pick. */
  names(slot: TraitSlot): string[]
  rollable(slot: TraitSlot): string[]
  validate(genome: Genome): void
}

const sameGrid = (a: Grid, b: Grid): boolean => {
  if (a.w !== b.w || a.h !== b.h) return false
  for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) return false
  return true
}

export function createEngine(library: PartLibrary = DEFAULT_LIBRARY): Engine {
  const composeWith = (genome: Genome, options: RenderOptions = {}): Grid =>
    upscale(
      compose(genome, { library, ...(options.poses ? { poses: options.poses } : {}) }),
      options.scale ?? 1,
    )

  const paletteFor = (genome: Genome): Palette => {
    const spec = library.palette[genome.palette]
    if (!spec) {
      throw new Error(
        `unknown palette "${genome.palette}" — have: ${Object.keys(library.palette).join(', ')}`,
      )
    }
    return buildPalette(spec)
  }

  return {
    library,

    generate: (seed, overrides = {}) => generate(seed, overrides, library),

    fromPrompt(prompt, overrides = {}) {
      const read = interpret(prompt, library)
      // Prompt-derived traits lose to explicit overrides, and both beat the roll.
      return generate(seedFromPrompt(prompt), { ...read.traits, ...overrides }, library)
    },

    interpret: (prompt) => interpret(prompt, library),

    compose: composeWith,
    paletteFor,
    render: (genome, options = {}) => toRGBA(composeWith(genome, options), paletteFor(genome)),
    toAscii: (genome, options = {}) => toAscii(composeWith(genome, options)),

    renderStory(genome, story, options = {}) {
      const board = getStory(story)
      validateStory(board, library)

      /*
       * Two different pose sets can draw the same picture, and `sampleStory`
       * cannot know which: it has no genome. A mascot with no accessory is
       * unmoved by a hat lag, and one with no mouth is unmoved by a mouth dip,
       * so a clip written for a mascot that has both would otherwise spend
       * frames on nothing.
       *
       * The collapse happens on the *unscaled* grid — a kilobyte to compare at
       * 32x32. Doing it after `upscale` would be megabytes a frame, which is
       * why the sampler compares a pose key instead of pixels in the first
       * place.
       */
      const kept: { grid: Grid; ms: number }[] = []
      for (const frame of sampleStory(board)) {
        const grid = compose(genome, { library, poses: frame.poses })
        const last = kept.at(-1)
        if (last && sameGrid(last.grid, grid)) last.ms += frame.ms
        else kept.push({ grid, ms: frame.ms })
      }
      return kept.map(({ grid, ms }) => ({ grid: upscale(grid, options.scale ?? 1), ms }))
    },

    storyDuration: (story) => storyDuration(getStory(story)),

    names: (slot) => names(library, slot),
    rollable: (slot) => rollableNames(library, slot),
    validate: (genome) => validateGenome(genome, library),
  }
}

/**
 * The default-library engine, re-exported as free functions so the common case
 * stays a one-liner. `createEngine(myLibrary)` gives the same surface bound to
 * custom parts.
 */
export const defaultEngine = createEngine()

export const { fromPrompt, renderStory, render, paletteFor } = defaultEngine

/** `generate` stays a plain function so a genome can be made without an engine. */
export { generate } from './genome.ts'

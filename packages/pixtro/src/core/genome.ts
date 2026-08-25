import { DEFAULT_LIBRARY, type PartLibrary, TRAIT_SLOTS, type TraitSlot } from './library.ts'
import { makeRng, weightedPick } from './rng.ts'
import type { Described } from './types.ts'

/**
 * The full description of one mascot. Small enough to put in a URL, and plain
 * JSON so it can be stored, diffed, or sent over the wire.
 *
 * Trait values are plain strings rather than a union of the built-in names,
 * because a library supplied at runtime can contain anything. They are checked
 * against the library on use, and `generate` refuses unknown names outright.
 */
export type Genome = {
  readonly seed: string
  readonly body: string
  readonly eyes: string
  readonly mouth: string
  readonly accessory: string
  readonly palette: string
}

export type Traits = Omit<Genome, 'seed'>

/**
 * Pick weights come off the parts themselves (`weight`, default 1), not from a
 * table here — a library loaded at runtime has to be able to declare how often
 * its own parts show up.
 */
function weightsFor(library: PartLibrary, slot: TraitSlot): Record<string, number> {
  const table: Record<string, number> = {}
  for (const [name, entry] of Object.entries(library[slot])) {
    const weight = (entry as Described).weight ?? 1
    if (weight > 0) table[name] = weight
  }
  return table
}

/**
 * Turn a seed into a mascot. Total and deterministic: any string works and the
 * same string always yields the same result against the same library.
 */
export function generate(
  seed: string,
  overrides: Partial<Traits> = {},
  library: PartLibrary = DEFAULT_LIBRARY,
): Genome {
  const rng = makeRng(seed)

  // Roll every slot in a fixed order even when it is overridden, so overriding
  // one trait does not shuffle the others. `--palette moss` should recolor a
  // mascot, not replace it.
  const traits = {} as Record<TraitSlot, string>
  for (const slot of TRAIT_SLOTS) {
    const rolled = weightedPick(rng, weightsFor(library, slot))
    const override = overrides[slot]
    traits[slot] = override === undefined ? rolled : validate(library, slot, override)
  }

  return { seed, ...traits }
}

function validate(library: PartLibrary, slot: TraitSlot, value: string): string {
  if (!(value in library[slot])) {
    throw new Error(
      `unknown ${slot} "${value}" — expected one of: ${Object.keys(library[slot]).join(', ')}`,
    )
  }
  return value
}

/** Assert a whole genome resolves against a library, naming every bad slot. */
export function validateGenome(genome: Genome, library: PartLibrary = DEFAULT_LIBRARY): void {
  for (const slot of TRAIT_SLOTS) validate(library, slot, genome[slot])
}

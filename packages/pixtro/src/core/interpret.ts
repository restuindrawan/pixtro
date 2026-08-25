import type { Traits } from './genome.ts'
import { DEFAULT_LIBRARY, type PartLibrary, TRAIT_SLOTS, type TraitSlot } from './library.ts'
import type { Described } from './types.ts'

/**
 * Prompt -> traits, scored against the tags parts carry.
 *
 * Deliberately not a model call. The mapping a prompt actually needs to do here
 * is "pick one of four eyes", and a lexicon does that offline, instantly,
 * deterministically, and with no API key. More importantly it *extends itself*:
 * a part supplied at runtime brings its own tags, so a custom library becomes
 * promptable without touching this file.
 *
 * Anything the prompt does not pin is left to the seed, so a prompt narrows a
 * mascot rather than fully specifying one.
 */

/** Words too common to carry meaning. Kept small on purpose. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'give',
  'i',
  'in',
  'is',
  'it',
  'like',
  'looking',
  'make',
  'me',
  'my',
  'of',
  'on',
  'or',
  'really',
  'so',
  'some',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'very',
  'want',
  'with',
  'who',
  'which',
])

/** Scores, highest first. An exact name beats a tag, which beats a stem match. */
const NAME_MATCH = 4
const TAG_MATCH = 3
const STEM_MATCH = 1
/** Below this length, prefix matching produces nonsense ("cat" matching "calm"). */
const MIN_STEM = 4

export function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

function scoreEntry(name: string, entry: Described, tokens: readonly string[]) {
  const tags = entry.tags ?? []
  let score = 0
  const matched: string[] = []

  for (const token of tokens) {
    if (token === name) {
      score += NAME_MATCH
      matched.push(token)
      continue
    }
    if (tags.includes(token)) {
      score += TAG_MATCH
      matched.push(token)
      continue
    }
    if (token.length >= MIN_STEM) {
      const stem = tags.some(
        (tag) =>
          (tag.length >= MIN_STEM && tag.startsWith(token)) ||
          (token.length >= MIN_STEM && token.startsWith(tag) && tag.length >= MIN_STEM),
      )
      if (stem) {
        score += STEM_MATCH
        matched.push(token)
      }
    }
  }

  return { score, matched }
}

export type SlotMatch = {
  readonly slot: TraitSlot
  readonly name: string
  readonly score: number
  /** Which words in the prompt drove the choice. */
  readonly terms: readonly string[]
}

export type Interpretation = {
  readonly prompt: string
  /** Only the slots the prompt actually pinned. Feed straight to `generate`. */
  readonly traits: Partial<Traits>
  readonly matches: readonly SlotMatch[]
  /** Words that matched nothing — useful for telling a user what was ignored. */
  readonly unused: readonly string[]
}

/**
 * Read a prompt against a library.
 *
 * Ties resolve to whichever entry is declared first, so the same prompt and the
 * same library always give the same answer.
 */
export function interpret(prompt: string, library: PartLibrary = DEFAULT_LIBRARY): Interpretation {
  const tokens = tokenize(prompt)
  const traits: Record<string, string> = {}
  const matches: SlotMatch[] = []
  // Tracked across *every* candidate, not just the winners. A word that picked
  // out a part which then lost a tie was still understood — reporting it as
  // ignored would send someone off rewording a prompt that already worked.
  const understood = new Set<string>()

  for (const slot of TRAIT_SLOTS) {
    let best: SlotMatch | undefined
    for (const [name, entry] of Object.entries(library[slot])) {
      const { score, matched } = scoreEntry(name, entry as Described, tokens)
      if (score === 0) continue
      for (const term of matched) understood.add(term)
      if (!best || score > best.score) best = { slot, name, score, terms: matched }
    }
    if (best) {
      traits[slot] = best.name
      matches.push(best)
    }
  }

  return {
    prompt,
    traits: traits as Partial<Traits>,
    matches,
    unused: tokens.filter((token) => !understood.has(token)),
  }
}

/**
 * A stable seed derived from the prompt itself.
 *
 * Without this, "a sleepy wizard" would still need a separate random seed for
 * the slots the prompt did not pin, and the same prompt would give a different
 * mascot every time.
 */
export function seedFromPrompt(prompt: string): string {
  return tokenize(prompt).join('-') || prompt.trim() || 'pixtro'
}

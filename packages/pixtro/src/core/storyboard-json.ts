import { DEFAULT_LIBRARY, type PartLibrary, TRAIT_SLOTS } from './library.ts'
import {
  type Beat,
  CLIP_NAMES,
  type Clip,
  type ClipRef,
  EASE_NAMES,
  type Ease,
  type Keyframe,
  type Storyboard,
} from './story.ts'
import { POSE_TARGETS, type PoseTarget } from './types.ts'

/**
 * The serialized storyboard format.
 *
 * The in-memory `Storyboard` type allows a beat's `clip` to be a string, an
 * inline clip, or an array of either. That union is pleasant in TypeScript and
 * miserable everywhere else — it needs `oneOf` in a JSON Schema, which both
 * language models and hand-editors get wrong.
 *
 * So the wire format is deliberately flat: a beat has an optional list of
 * built-in `clips` to layer and an optional set of inline `tracks`. Every field
 * is a plain scalar, array, or object. `parseStoryboard` folds that back into
 * the richer internal shape.
 */

export type KeyframeJSON = {
  at: number
  dx?: number
  dy?: number
  part?: string
  hidden?: boolean
  ease?: Ease
}

export type BeatJSON = {
  /** Names of built-in clips to layer together for this beat. */
  clips?: string[]
  /** Inline keyframe tracks, keyed by target. Requires `duration`. */
  tracks?: Partial<Record<PoseTarget, KeyframeJSON[]>>
  /** Length of the inline tracks in milliseconds. */
  duration?: number
  repeat?: number
  reverse?: boolean
  speed?: number
  hold?: number
}

export type StoryboardJSON = {
  beats: BeatJSON[]
  loop?: boolean
}

/** Guards against a model or a typo asking for a million-frame animation. */
const LIMITS = {
  beats: 32,
  keyframes: 64,
  duration: 60_000,
  repeat: 32,
  offset: 64,
  speed: 16,
} as const

class StoryboardParseError extends Error {
  override name = 'StoryboardParseError'
}

const fail = (path: string, message: string): never => {
  throw new StoryboardParseError(`${path}: ${message}`)
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, `expected an object, got ${Array.isArray(value) ? 'an array' : typeof value}`)
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, `expected a number, got ${typeof value}`)
  }
  const n = value as number
  if (n < min || n > max) fail(path, `must be between ${min} and ${max}, got ${n}`)
  return n
}

function parseKeyframe(value: unknown, path: string): Keyframe {
  const raw = asObject(value, path)
  if (raw.at === undefined) fail(path, 'is missing "at" (milliseconds from the clip start)')

  const key: Record<string, unknown> = { at: asNumber(raw.at, `${path}.at`, 0, LIMITS.duration) }
  if (raw.dx !== undefined)
    key.dx = Math.round(asNumber(raw.dx, `${path}.dx`, -LIMITS.offset, LIMITS.offset))
  if (raw.dy !== undefined)
    key.dy = Math.round(asNumber(raw.dy, `${path}.dy`, -LIMITS.offset, LIMITS.offset))
  if (raw.hidden !== undefined) {
    if (typeof raw.hidden !== 'boolean') fail(`${path}.hidden`, 'expected true or false')
    key.hidden = raw.hidden
  }
  if (raw.part !== undefined) {
    if (typeof raw.part !== 'string') fail(`${path}.part`, 'expected a part name')
    key.part = raw.part
  }
  if (raw.ease !== undefined) {
    if (!EASE_NAMES.includes(raw.ease as Ease)) {
      fail(
        `${path}.ease`,
        `expected one of ${EASE_NAMES.join(', ')}, got ${JSON.stringify(raw.ease)}`,
      )
    }
    key.ease = raw.ease as Ease
  }
  return key as Keyframe
}

function parseTracks(value: unknown, path: string): Clip['tracks'] {
  const raw = asObject(value, path)
  const tracks: Record<string, Keyframe[]> = {}

  for (const [target, list] of Object.entries(raw)) {
    if (!POSE_TARGETS.includes(target as PoseTarget)) {
      fail(`${path}.${target}`, `not a track target — expected one of: ${POSE_TARGETS.join(', ')}`)
    }
    if (!Array.isArray(list)) fail(`${path}.${target}`, 'expected an array of keyframes')
    const keys = list as unknown[]
    if (keys.length === 0) fail(`${path}.${target}`, 'has no keyframes')
    if (keys.length > LIMITS.keyframes) {
      fail(`${path}.${target}`, `has ${keys.length} keyframes, the limit is ${LIMITS.keyframes}`)
    }

    const parsed = keys.map((key, i) => parseKeyframe(key, `${path}.${target}[${i}]`))
    // Sampling walks keyframes in order and assumes they advance in time.
    // Sorting here is friendlier than rejecting, and makes hand-editing forgiving.
    parsed.sort((a, b) => a.at - b.at)
    tracks[target] = parsed
  }

  // `tracks: {}` with a duration is allowed on purpose — it is how you write a
  // pause that holds the resting pose. An empty track *array* is still an error,
  // because that is a typo rather than an intent.
  return tracks as Clip['tracks']
}

function parseBeat(value: unknown, path: string, clipNames: readonly string[]): Beat {
  const raw = asObject(value, path)
  const refs: ClipRef[] = []

  if (raw.clips !== undefined) {
    if (!Array.isArray(raw.clips)) fail(`${path}.clips`, 'expected an array of clip names')
    for (const [i, name] of (raw.clips as unknown[]).entries()) {
      if (typeof name !== 'string') fail(`${path}.clips[${i}]`, 'expected a clip name')
      if (!clipNames.includes(name as string)) {
        fail(`${path}.clips[${i}]`, `unknown clip "${name}" — available: ${clipNames.join(', ')}`)
      }
      refs.push(name as string)
    }
  }

  if (raw.tracks !== undefined) {
    const tracks = parseTracks(raw.tracks, `${path}.tracks`)
    if (raw.duration === undefined) {
      fail(path, 'has inline "tracks" but no "duration" — inline tracks need an explicit length')
    }
    refs.push({ duration: asNumber(raw.duration, `${path}.duration`, 1, LIMITS.duration), tracks })
  }

  if (refs.length === 0) fail(path, 'needs "clips", "tracks", or both')

  const beat: Record<string, unknown> = { clip: refs.length === 1 ? refs[0] : refs }
  if (raw.repeat !== undefined) {
    beat.repeat = Math.round(asNumber(raw.repeat, `${path}.repeat`, 1, LIMITS.repeat))
  }
  if (raw.speed !== undefined) {
    beat.speed = asNumber(raw.speed, `${path}.speed`, 1 / LIMITS.speed, LIMITS.speed)
  }
  if (raw.hold !== undefined) {
    beat.hold = Math.round(asNumber(raw.hold, `${path}.hold`, 0, LIMITS.duration))
  }
  if (raw.reverse !== undefined) {
    if (typeof raw.reverse !== 'boolean') fail(`${path}.reverse`, 'expected true or false')
    beat.reverse = raw.reverse
  }
  return beat as Beat
}

/**
 * Parse an untrusted storyboard.
 *
 * This is the single gate for every storyboard that did not come from source:
 * a `--story` file, a textarea in the web editor, or a model's tool call. It
 * throws with a JSON path (`beats[1].tracks.eyes[0].ease`) so the message is
 * actionable whether a person or a model has to act on it.
 *
 * It checks *shape*, not whether referenced parts exist — that is
 * `validateStory`'s job, since it needs a library.
 */
export function parseStoryboard(
  value: unknown,
  clipNames: readonly string[] = CLIP_NAMES,
): Storyboard {
  const raw = asObject(value, 'storyboard')
  if (!Array.isArray(raw.beats)) fail('storyboard.beats', 'expected an array of beats')

  const beats = raw.beats as unknown[]
  if (beats.length === 0)
    fail('storyboard.beats', 'is empty — a storyboard needs at least one beat')
  if (beats.length > LIMITS.beats) {
    fail('storyboard.beats', `has ${beats.length} beats, the limit is ${LIMITS.beats}`)
  }

  const story: Record<string, unknown> = {
    beats: beats.map((beat, i) => parseBeat(beat, `storyboard.beats[${i}]`, clipNames)),
  }
  if (raw.loop !== undefined) {
    if (typeof raw.loop !== 'boolean') fail('storyboard.loop', 'expected true or false')
    story.loop = raw.loop
  }
  return story as Storyboard
}

/** Parse from a JSON string, with the syntax error reported cleanly. */
export function parseStoryboardText(text: string, clipNames?: readonly string[]): Storyboard {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new StoryboardParseError(
      `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return parseStoryboard(value, clipNames)
}

export { StoryboardParseError }

/**
 * The inverse of `parseStoryboard`.
 *
 * This is what makes the built-ins a starting point rather than a wall: pick
 * `alive`, get its JSON, edit it. The editor and the CLI's `--save-story` both
 * go through here, so "show me this animation as text" is one code path.
 */
export function toStoryboardJSON(story: Storyboard): StoryboardJSON {
  const beats = story.beats.map((beat): BeatJSON => {
    const refs = (Array.isArray(beat.clip) ? beat.clip : [beat.clip]) as readonly ClipRef[]
    const clips = refs.filter((ref): ref is string => typeof ref === 'string')
    const inline = refs.find((ref): ref is Clip => typeof ref !== 'string')

    const out: BeatJSON = {}
    if (clips.length) out.clips = [...clips]
    if (inline) {
      out.duration = inline.duration
      out.tracks = Object.fromEntries(
        Object.entries(inline.tracks).map(([target, keys]) => [
          target,
          (keys ?? []).map((key) => ({ ...key })),
        ]),
      ) as NonNullable<BeatJSON['tracks']>
    }
    if (beat.repeat !== undefined) out.repeat = beat.repeat
    if (beat.reverse !== undefined) out.reverse = beat.reverse
    if (beat.speed !== undefined) out.speed = beat.speed
    if (beat.hold !== undefined) out.hold = beat.hold
    return out
  })

  return story.loop === undefined ? { beats } : { beats, loop: story.loop }
}

/** Pretty-print a storyboard for a file or a text editor. */
export function formatStoryboard(story: Storyboard): string {
  return JSON.stringify(toStoryboardJSON(story), null, 2)
}

/**
 * JSON Schema for the wire format, used as a tool input schema.
 *
 * Note there is no `strict: true` on the tool that carries this. Strict mode
 * constrains the *shape*, but it cannot know that `part: "sleepy"` has to name
 * an eyes part that this library actually contains — so a validate-and-repair
 * round trip is required regardless. Given that, a plain schema plus a precise
 * error message is both simpler and better at catching real mistakes.
 */
export const STORYBOARD_SCHEMA = {
  type: 'object',
  required: ['beats'],
  additionalProperties: false,
  properties: {
    beats: {
      type: 'array',
      minItems: 1,
      maxItems: LIMITS.beats,
      description: 'Beats play one after another, in order.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          clips: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Names of built-in clips to play together for this beat. Listing more than one layers them, so their tracks run in parallel.',
          },
          tracks: {
            type: 'object',
            additionalProperties: false,
            description:
              'Custom keyframes for this beat, keyed by what they move. Requires "duration".',
            properties: Object.fromEntries(
              POSE_TARGETS.map((target) => [
                target,
                {
                  type: 'array',
                  maxItems: LIMITS.keyframes,
                  items: {
                    type: 'object',
                    required: ['at'],
                    additionalProperties: false,
                    properties: {
                      at: {
                        type: 'number',
                        description: 'Milliseconds from the start of this beat.',
                      },
                      dx: { type: 'number', description: 'Horizontal offset in pixels.' },
                      dy: {
                        type: 'number',
                        description: 'Vertical offset in pixels. Negative is up.',
                      },
                      part: {
                        type: 'string',
                        description:
                          'Swap in a different part for this slot, e.g. "blink". Not valid on the "all" track.',
                      },
                      hidden: { type: 'boolean', description: 'Hide this slot.' },
                      ease: {
                        type: 'string',
                        enum: EASE_NAMES,
                        description:
                          'How to arrive from the previous keyframe, for dx/dy only — a part swap always snaps. "hold" (default) stays put and then snaps. The rest tween: "easeOut" starts fast and lands slowly, "easeIn" the reverse, "easeInOut" both, "linear" moves at a constant speed. Prefer an eased curve for anything with weight; "linear" is for things that really do travel at one speed.',
                      },
                    },
                  },
                },
              ]),
            ),
          },
          duration: {
            type: 'number',
            description: 'Length of this beat in milliseconds. Required when "tracks" is used.',
          },
          repeat: { type: 'integer', minimum: 1, maximum: LIMITS.repeat },
          reverse: { type: 'boolean' },
          speed: { type: 'number', description: 'Playback multiplier. 2 is twice as fast.' },
          hold: {
            type: 'number',
            description: 'Extra still time after this beat, holding its final pose.',
          },
        },
      },
    },
    loop: { type: 'boolean', description: 'Whether the animation is meant to loop. Default true.' },
  },
} as const

/**
 * A compact description of what a storyboard may reference.
 *
 * Built from the live library rather than hardcoded, so custom parts are
 * automatically available to whatever is authoring — the same property that
 * makes the tag lexicon extensible.
 */
export function describeLibrary(library: PartLibrary = DEFAULT_LIBRARY): string {
  const slots = TRAIT_SLOTS.filter((slot) => slot !== 'palette')
    .map((slot) => `  ${slot}: ${Object.keys(library[slot]).join(', ')}`)
    .join('\n')

  return [
    `Track targets: ${POSE_TARGETS.join(', ')}`,
    '  "all" moves the whole sprite. The others move or swap one slot.',
    '',
    'Parts that can be swapped in with "part", by slot:',
    slots,
    '',
    `Built-in clips usable in "clips": ${CLIP_NAMES.join(', ')}`,
    '',
    'The sprite is 32x32. Offsets beyond about 8 pixels move it off the canvas,',
    'which is only useful for entrances and exits.',
  ].join('\n')
}

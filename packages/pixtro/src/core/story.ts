import { DEFAULT_LIBRARY, type PartLibrary } from './library.ts'
import { POSE_TARGETS, type Pose, type PoseSet, type PoseTarget } from './types.ts'

/**
 * The storyboard engine.
 *
 * Three layers, smallest to largest:
 *
 *   Keyframe  a pose for one target at one moment
 *   Clip      parallel tracks over a fixed duration — "bob while blinking"
 *   Storyboard  beats played in sequence — "sleep, then stir, then bounce"
 *
 * Tracks run in parallel, beats run in series. That split is what lets you
 * *story* an animation: author small reusable clips, then arrange them.
 *
 * Everything here is plain JSON-serializable data, so a storyboard can live in
 * a file, ship over the wire, or be built in a UI — the same reason parts are
 * authored as text.
 */

/**
 * How to reach a keyframe from the one before it.
 *
 * `hold` (the default) is stepped: the previous pose stays put, then snaps.
 * That is what a part swap wants — `part` and `hidden` always step, because
 * there is no such thing as half a sprite swap. The four curves tween `dx`/`dy`
 * and round to whole pixels.
 *
 * Rounding is what makes the curves worth having at 32 pixels. A three-pixel
 * move under `easeOut` does not slide: it puts two pixels down almost at once
 * and takes its time over the last, which is the *spacing* a hand animator
 * would have drawn. `linear` covers equal ground per frame, and equal spacing
 * is the thing that reads as machinery — reach for it only when something
 * really does travel at a constant speed.
 */
export type Ease = 'hold' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/**
 * Quadratic, not cubic. Over the two or three pixels these clips actually move,
 * a cubic curve parks so long at each end that the move reads as a stutter with
 * a lurch in the middle; a quadratic spreads the same distance into steps that
 * still differ from each other but never strand a pixel.
 */
const EASES: Record<Ease, ((t: number) => number) | null> = {
  hold: null,
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
}

export const EASE_NAMES = Object.keys(EASES) as Ease[]

export type Keyframe = Pose & {
  /** Milliseconds from the start of the clip. */
  readonly at: number
  readonly ease?: Ease
}

export type Clip = {
  readonly duration: number
  readonly tracks: Partial<Record<PoseTarget, readonly Keyframe[]>>
}

/** A clip by name from the registry, or an inline one. */
export type ClipRef = string | Clip

export type Beat = {
  /** One clip, or several to layer together (tracks merge, later wins). */
  readonly clip: ClipRef | readonly ClipRef[]
  /** Play the beat this many times back to back. Default 1. */
  readonly repeat?: number
  /** Play it backwards. */
  readonly reverse?: boolean
  /** Multiply playback speed. 2 is twice as fast. Default 1. */
  readonly speed?: number
  /** Extra still time after the beat, holding its final pose. */
  readonly hold?: number
}

export type Storyboard = {
  readonly beats: readonly Beat[]
  /** Advisory for players and for GIF export. Default true. */
  readonly loop?: boolean
}

// --- built-in clips ---------------------------------------------------------

/**
 * The built-in clips.
 *
 * Three things constrain every one of them, and all three are worth knowing
 * before editing the numbers.
 *
 * **There is almost no room to move.** A `tall` or `hero` body wearing the
 * `hat` already touches the top of the canvas, and `hero` sits one pixel off
 * the bottom. So looping motion stays inside `dy` 0..+1 — it *settles* rather
 * than floats — and only the accent clips reach up to -2, briefly, where the
 * crop reads as leaving frame rather than as a bug.
 *
 * **A one-pixel move has no curve.** An ease over a single pixel only decides
 * *when* the one step happens, which a plain `hold` key says more clearly. The
 * curves are here for the moves that cross real distance: the launch and fall
 * in `bounce`, the entrance in `riseUp`.
 *
 * **Drag sinks, it does not lift.** Accessories sit flush on the head, so an
 * accessory left a pixel *above* the body opens a visible gap and reads as the
 * hat coming off. When the body rises the hat lags downward and merely sinks
 * into the head, which is both invisible and what inertia would do anyway. So
 * the lag is on the way up only — the one exception is the landing in
 * `bounce`, where a hard stop really does throw a hat off a head.
 */
const CLIPS = {
  /**
   * The idle: one slow settle and rise, with the hat arriving after the body.
   *
   * 1800ms is not arbitrary — it matches `blinkTwice` exactly so that `alive`
   * can layer the two and still loop cleanly. Layering takes the longer of the
   * two durations, so a mismatch would park the body at the end of its arc
   * waiting for the eyes to finish, then pop back to the start.
   */
  bob: {
    duration: 1800,
    tracks: {
      all: [
        { at: 0, dy: 0 },
        { at: 450, dy: 1 },
        { at: 1380, dy: 0 },
      ],
      accessory: [
        { at: 0, dy: 0 },
        { at: 1380, dy: 1 },
        { at: 1500, dy: 0 },
      ],
    },
  },

  /** Bigger and faster than `bob`, and it leaves the ground. */
  bounce: {
    duration: 760,
    tracks: {
      all: [
        /*
         * Anticipation, launch, hang, fall, squash, settle. The apex is where
         * the time goes: `easeOut` up and `easeIn` down means the sprite is
         * only between the ground and the top for a frame or two either way.
         *
         * The paired keys at 60/170 and 500/560 are holds. A tween begins the
         * instant its previous key passes, so without a second key at the same
         * offset the crouch would be over before it registered — an `easeOut`
         * spends its first frames covering ground, not waiting.
         */
        { at: 0, dy: 0 },
        { at: 60, dy: 1 },
        { at: 170, dy: 1 },
        { at: 260, dy: -2, ease: 'easeOut' },
        { at: 380, dy: -2 },
        { at: 500, dy: 1, ease: 'easeIn' },
        { at: 560, dy: 1 },
        { at: 620, dy: 0 },
      ],
      accessory: [
        { at: 0, dy: 0 },
        { at: 200, dy: 1 },
        { at: 340, dy: 0 },
        // The one place a hat is allowed to leave the head: it was still on its
        // way up when the body hit the ground.
        { at: 500, dy: -1 },
        { at: 560, dy: 0 },
      ],
    },
  },

  /** Long hold, then a quick double blink. Paired with `bob` in `alive`. */
  blinkTwice: {
    duration: 1800,
    tracks: {
      eyes: [
        { at: 0 },
        { at: 1120, part: 'blink' },
        { at: 1210 },
        { at: 1350, part: 'blink' },
        { at: 1420 },
      ],
    },
  },

  /** Eyes closed, body breathing slowly. In is slower than out. */
  sleeping: {
    duration: 3200,
    tracks: {
      eyes: [{ at: 0, part: 'sleepy' }],
      all: [
        { at: 0, dy: 0 },
        { at: 800, dy: 1 },
        { at: 2400, dy: 0 },
      ],
      accessory: [
        { at: 0, dy: 0 },
        { at: 2400, dy: 1 },
        { at: 2560, dy: 0 },
      ],
    },
  },

  /** Waking up: heavy lids, a blink, then open — and one more as it comes to. */
  stir: {
    duration: 1100,
    tracks: {
      eyes: [
        { at: 0, part: 'sleepy' },
        { at: 240, part: 'blink' },
        { at: 360, part: 'sleepy' },
        { at: 620, part: 'blink' },
        { at: 700 },
        { at: 780, part: 'blink' },
        { at: 850 },
      ],
      all: [
        { at: 0, dy: 0 },
        { at: 300, dy: 1 },
        { at: 620, dy: 0 },
      ],
    },
  },

  /**
   * Glance left, then right. The eyes snap — a real saccade is ballistic and
   * far too fast to tween — and the head leans after them, which is the part
   * that sells it as looking rather than as the eyes sliding around the face.
   */
  look: {
    duration: 2200,
    tracks: {
      eyes: [
        { at: 0, dx: 0 },
        { at: 260, dx: -2 },
        { at: 1040, dx: 0 },
        { at: 1160, dx: 2 },
        { at: 1900, dx: 0 },
      ],
      all: [
        { at: 0, dx: 0 },
        { at: 340, dx: -1 },
        { at: 1120, dx: 0 },
        { at: 1240, dx: 1 },
        { at: 1980, dx: 0 },
      ],
    },
  },

  /**
   * Two head dips. The face leads the body by a frame and the hat settles a
   * frame after it, so the dip travels through the sprite instead of
   * teleporting the whole thing.
   */
  nod: {
    duration: 720,
    tracks: {
      eyes: [
        { at: 0, dy: 0 },
        { at: 90, dy: 1 },
        { at: 250, dy: 0 },
        { at: 390, dy: 1 },
        { at: 550, dy: 0 },
      ],
      mouth: [
        { at: 0, dy: 0 },
        { at: 90, dy: 1 },
        { at: 250, dy: 0 },
        { at: 390, dy: 1 },
        { at: 550, dy: 0 },
      ],
      all: [
        { at: 0, dy: 0 },
        { at: 130, dy: 1 },
        { at: 290, dy: 0 },
        { at: 430, dy: 1 },
        { at: 590, dy: 0 },
      ],
      accessory: [
        { at: 0, dy: 0 },
        { at: 290, dy: 1 },
        { at: 390, dy: 0 },
        { at: 590, dy: 1 },
        { at: 690, dy: 0 },
      ],
    },
  },

  /** Slide up from off-canvas, decelerate into place, overshoot, settle. */
  riseUp: {
    duration: 900,
    tracks: {
      all: [
        { at: 0, dy: 34 },
        { at: 560, dy: 0, ease: 'easeOut' },
        // Overshoot past the stop, in the direction of travel, then settle.
        { at: 660, dy: -1 },
        { at: 780, dy: 0 },
      ],
      // The drag shrinks as the body slows, rather than holding one offset all
      // the way up — a constant lag reads as a differently-placed hat.
      accessory: [
        { at: 0, dy: 2 },
        { at: 300, dy: 1 },
        { at: 520, dy: 0 },
        { at: 660, dy: 1 },
        { at: 780, dy: 0 },
      ],
    },
  },
} as const satisfies Record<string, Clip>

export type ClipName = keyof typeof CLIPS

export const CLIP_NAMES = Object.keys(CLIPS) as ClipName[]

// --- built-in storyboards ---------------------------------------------------

const STORIES = {
  /** One frame. Useful for a static export. */
  still: { beats: [{ clip: { duration: 1000, tracks: {} } }] },

  idle: { beats: [{ clip: 'bob' }] },

  blink: { beats: [{ clip: 'blinkTwice' }] },

  /**
   * Bob and blink at once. Layering two clips is the point here — neither
   * knows about the other, and their tracks address different targets.
   */
  alive: { beats: [{ clip: ['bob', 'blinkTwice'], repeat: 1 }] },

  /** A three-beat story: asleep, stirring, then awake and bouncing. */
  wake: {
    beats: [
      { clip: 'sleeping' },
      { clip: 'stir' },
      { clip: 'bounce', repeat: 2 },
      { clip: 'bob', hold: 300 },
    ],
  },

  curious: {
    beats: [{ clip: 'look' }, { clip: 'nod' }, { clip: ['bob', 'blinkTwice'] }],
  },

  entrance: {
    beats: [{ clip: 'riseUp' }, { clip: ['bob', 'blinkTwice'] }],
  },
} as const satisfies Record<string, Storyboard>

export type StoryName = keyof typeof STORIES

export const STORY_NAMES = Object.keys(STORIES) as StoryName[]

export function getClip(ref: ClipRef): Clip {
  if (typeof ref !== 'string') return ref
  const clip = CLIPS[ref as ClipName]
  if (!clip) throw new Error(`unknown clip "${ref}" — have: ${CLIP_NAMES.join(', ')}`)
  return clip
}

export function getStory(ref: StoryName | Storyboard): Storyboard {
  if (typeof ref !== 'string') return ref
  const story = STORIES[ref]
  if (!story) throw new Error(`unknown story "${ref}" — have: ${STORY_NAMES.join(', ')}`)
  return story
}

export { CLIPS, STORIES }

// --- sampling ---------------------------------------------------------------

/** Merge layered clips into one. Later clips win on a shared target. */
function layer(refs: ClipRef | readonly ClipRef[]): Clip {
  const list = (Array.isArray(refs) ? refs : [refs]) as readonly ClipRef[]
  const clips = list.map(getClip)
  if (clips.length === 1) return clips[0] as Clip

  const tracks: Record<string, readonly Keyframe[]> = {}
  let duration = 0
  for (const clip of clips) {
    duration = Math.max(duration, clip.duration)
    for (const [target, keys] of Object.entries(clip.tracks)) {
      if (keys) tracks[target] = keys
    }
  }
  // A shorter layer simply holds its last pose for the remainder.
  return { duration, tracks: tracks as Clip['tracks'] }
}

type Segment = { clip: Clip; start: number; duration: number; reverse: boolean; speed: number }

function expand(story: Storyboard): { segments: Segment[]; duration: number } {
  const segments: Segment[] = []
  let cursor = 0
  for (const beat of story.beats) {
    const clip = layer(beat.clip)
    const speed = beat.speed && beat.speed > 0 ? beat.speed : 1
    const span = clip.duration / speed
    const repeat = Math.max(1, Math.floor(beat.repeat ?? 1))
    for (let i = 0; i < repeat; i++) {
      segments.push({ clip, start: cursor, duration: span, reverse: !!beat.reverse, speed })
      cursor += span
    }
    cursor += Math.max(0, beat.hold ?? 0)
  }
  return { segments, duration: cursor }
}

const lerpRound = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

/** Resolve one track at a local clip time. */
function sampleTrack(keys: readonly Keyframe[], t: number): Pose {
  if (keys.length === 0) return {}
  const first = keys[0] as Keyframe
  if (t <= first.at) return poseOf(first)

  let previous = first
  for (let i = 1; i < keys.length; i++) {
    const key = keys[i] as Keyframe
    if (t < key.at) {
      // An unknown ease can only arrive from a hand-built object — `parseStoryboard`
      // rejects one — and stepping is the safe reading of "I don't know".
      const curve = EASES[key.ease ?? 'hold']
      if (!curve) return poseOf(previous)
      const span = key.at - previous.at
      const ratio = span <= 0 ? 1 : (t - previous.at) / span
      const eased = curve(Math.max(0, Math.min(1, ratio)))
      return {
        ...poseOf(previous),
        dx: lerpRound(previous.dx ?? 0, key.dx ?? 0, eased),
        dy: lerpRound(previous.dy ?? 0, key.dy ?? 0, eased),
      }
    }
    previous = key
  }
  return poseOf(previous)
}

function poseOf(key: Keyframe): Pose {
  const pose: { dx?: number; dy?: number; part?: string; hidden?: boolean } = {}
  if (key.dx !== undefined) pose.dx = key.dx
  if (key.dy !== undefined) pose.dy = key.dy
  if (key.part !== undefined) pose.part = key.part
  if (key.hidden !== undefined) pose.hidden = key.hidden
  return pose
}

/** Resolve the whole pose set at a global storyboard time. */
export function poseAt(story: Storyboard, t: number): PoseSet {
  const { segments, duration } = expand(story)
  const clamped = Math.max(0, Math.min(t, duration))
  // The last segment whose start is at or before `clamped`; during a `hold`
  // gap this keeps the previous segment's final pose on screen.
  let active: Segment | undefined
  for (const segment of segments) {
    if (segment.start <= clamped) active = segment
    else break
  }
  if (!active) return {}

  const elapsed = Math.min(clamped - active.start, active.duration)
  const local = active.reverse
    ? active.clip.duration - elapsed * active.speed
    : elapsed * active.speed

  const poses: Record<string, Pose> = {}
  for (const target of POSE_TARGETS) {
    const keys = active.clip.tracks[target]
    if (keys?.length) poses[target] = sampleTrack(keys, local)
  }
  return poses as PoseSet
}

/** Stable identity for a pose set, so identical states collapse into one frame. */
function poseKey(poses: PoseSet): string {
  return POSE_TARGETS.map((target) => {
    const pose = poses[target]
    if (!pose) return ''
    return `${target}:${pose.dx ?? 0},${pose.dy ?? 0},${pose.part ?? ''},${pose.hidden ? 1 : 0}`
  }).join('|')
}

/** Milliseconds between samples inside a tweened span. ~33fps, on the grid below. */
const TWEEN_STEP = 30

/**
 * A GIF delay is hundredths of a second, and every decoder clamps anything
 * under two of them up to a tenth — so a 14ms frame does not play for 14ms, it
 * plays for 100 and takes the animation with it.
 *
 * The frame grid is therefore snapped to 10ms, and no frame is allowed to come
 * out shorter than 20ms. Snapping the *boundaries* rather than the durations is
 * what keeps this drift-free: the clip still ends exactly when it says it does.
 */
const FRAME_QUANTUM = 10
const MIN_FRAME = 20

export type SampledFrame = { readonly poses: PoseSet; readonly ms: number }

/**
 * Flatten a storyboard into discrete frames.
 *
 * Rather than sampling at a fixed frame rate, this samples at every moment
 * something *could* change — keyframe times, segment boundaries, plus a ~30fps
 * walk through tweened spans only — then collapses runs of identical pose sets
 * into a single frame with a longer duration.
 *
 * The result is the minimum number of frames that still shows every distinct
 * state, which is exactly what keeps exported GIFs small: a two-second hold is
 * one frame, not sixty.
 */
export function sampleStory(story: Storyboard): SampledFrame[] {
  const { segments, duration } = expand(story)
  if (duration <= 0) return [{ poses: {}, ms: 0 }]

  const snap = (t: number) =>
    Math.round(Math.max(0, Math.min(t, duration)) / FRAME_QUANTUM) * FRAME_QUANTUM

  // Two kinds of moment, and the difference decides who survives a collision:
  // a keyframe is a state the storyboard asked for, a walk sample is filler
  // along the way to one.
  const keyTimes = new Set<number>([0])
  const walkTimes = new Set<number>()
  for (const segment of segments) {
    keyTimes.add(snap(segment.start))
    const toGlobal = (local: number) => {
      const elapsed = segment.reverse
        ? (segment.clip.duration - local) / segment.speed
        : local / segment.speed
      return segment.start + elapsed
    }
    for (const keys of Object.values(segment.clip.tracks)) {
      for (const [index, key] of (keys ?? []).entries()) {
        keyTimes.add(snap(toGlobal(key.at)))
        // A tweened span changes continuously, so walk it.
        if (key.ease !== undefined && key.ease !== 'hold' && index > 0) {
          const previous = (keys as Keyframe[])[index - 1] as Keyframe
          for (let at = previous.at; at < key.at; at += TWEEN_STEP)
            walkTimes.add(snap(toGlobal(at)))
        }
      }
    }
  }

  const candidates = [...new Set([...keyTimes, ...walkTimes])].sort((a, b) => a - b)
  const ordered: number[] = []
  for (const [index, at] of candidates.entries()) {
    const previous = ordered.at(-1)
    const isKey = keyTimes.has(at)
    if (previous !== undefined && at - previous < MIN_FRAME) {
      // Too close to the frame already open. A keyframe takes the slot from the
      // filler holding it; filler yields.
      if (isKey) ordered[ordered.length - 1] = at
      continue
    }
    // Filler that would leave the keyframe right behind it no room at all.
    const next = candidates[index + 1]
    if (!isKey && next !== undefined && keyTimes.has(next) && next - at < MIN_FRAME) continue
    ordered.push(at)
  }
  // Same rule against the end of the storyboard.
  while (ordered.length > 1 && duration - (ordered.at(-1) as number) < MIN_FRAME) ordered.pop()

  const frames: { poses: PoseSet; key: string; ms: number }[] = []
  for (const [index, at] of ordered.entries()) {
    const until = ordered[index + 1] ?? duration
    const ms = Math.round(until - at)
    if (ms <= 0) continue
    const poses = poseAt(story, at)
    const key = poseKey(poses)
    const last = frames.at(-1)
    if (last && last.key === key) last.ms += ms
    else frames.push({ poses, key, ms })
  }

  if (frames.length === 0) return [{ poses: poseAt(story, 0), ms: Math.round(duration) }]
  return frames.map(({ poses, ms }) => ({ poses, ms }))
}

/**
 * Check every part a storyboard swaps in actually exists.
 *
 * Worth doing up front: a story authored against the default parts will
 * reference `blink` and `sleepy`, and a custom library need not have either.
 * Failing here names the story's missing part instead of failing mid-render.
 */
export function validateStory(story: Storyboard, library: PartLibrary = DEFAULT_LIBRARY): void {
  const { segments } = expand(story)
  for (const segment of segments) {
    for (const [target, keys] of Object.entries(segment.clip.tracks)) {
      if (target === 'all') continue
      for (const key of keys ?? []) {
        if (key.part === undefined) continue
        const slot = target as Exclude<PoseTarget, 'all'>
        if (!(key.part in library[slot])) {
          throw new Error(
            `storyboard swaps in ${slot} "${key.part}", which this library does not have ` +
              `(has: ${Object.keys(library[slot]).join(', ')})`,
          )
        }
      }
    }
  }
}

export function storyDuration(story: Storyboard): number {
  return expand(story).duration
}

const canPlay = (story: Storyboard, library: PartLibrary): boolean => {
  try {
    validateStory(story, library)
    return true
  } catch {
    return false
  }
}

/**
 * The built-in clips and storyboards a given library can actually play.
 *
 * Most of the built-ins are not universal: `blinkTwice` swaps in the `blink`
 * eyes and `sleeping` swaps in `sleepy`, and a library assembled at runtime need
 * not have either. Without this a caller can only offer the whole list and let
 * half of it throw on selection — which is exactly what happens to a library
 * built from `EMPTY_BASE`.
 */
export function playableClips(library: PartLibrary = DEFAULT_LIBRARY): ClipName[] {
  return CLIP_NAMES.filter((name) => canPlay({ beats: [{ clip: name }] }, library))
}

export function playableStories(library: PartLibrary = DEFAULT_LIBRARY): StoryName[] {
  return STORY_NAMES.filter((name) => canPlay(STORIES[name], library))
}

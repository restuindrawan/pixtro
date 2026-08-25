import { describe, expect, it } from 'vitest'
import {
  defaultEngine,
  parseStoryboard,
  parseStoryboardText,
  poseAt,
  STORIES,
  STORYBOARD_SCHEMA,
  type Storyboard,
  storyDuration,
  toStoryboardJSON,
  validateStory,
} from '../src/core/index.ts'

/**
 * `parseStoryboard` is the single gate for every storyboard that did not come
 * from source — a `--story` file, the web editor's textarea, or an agent's tool
 * call. Everything it lets through is rendered, so it has to reject precisely
 * and explain itself well enough that whoever sent it can fix it.
 */
describe('parseStoryboard', () => {
  it('accepts a beat that layers built-in clips', () => {
    const story = parseStoryboard({ beats: [{ clips: ['bob', 'blinkTwice'] }] })
    const poses = poseAt(story, 100)
    expect(poses.all).toBeDefined()
    expect(poses.eyes).toBeDefined()
  })

  it('accepts inline keyframe tracks', () => {
    const story = parseStoryboard({
      beats: [
        {
          duration: 400,
          tracks: {
            all: [
              { at: 0, dy: 0 },
              { at: 200, dy: -4 },
            ],
          },
        },
      ],
    })
    expect(poseAt(story, 250).all?.dy).toBe(-4)
    expect(storyDuration(story)).toBe(400)
  })

  it('accepts clips and inline tracks in the same beat', () => {
    const story = parseStoryboard({
      beats: [{ clips: ['bob'], duration: 600, tracks: { eyes: [{ at: 0, part: 'blink' }] } }],
    })
    expect(poseAt(story, 100).eyes?.part).toBe('blink')
  })

  it('sorts keyframes by time so hand-edited files are forgiving', () => {
    const story = parseStoryboard({
      beats: [
        {
          duration: 400,
          tracks: {
            all: [
              { at: 200, dy: 9 },
              { at: 0, dy: 1 },
            ],
          },
        },
      ],
    })
    expect(poseAt(story, 50).all?.dy).toBe(1)
    expect(poseAt(story, 250).all?.dy).toBe(9)
  })

  it('round-trips every built-in story through the wire format', () => {
    // The built-ins are authored in the richer internal shape; anything they can
    // express must survive being written down and read back.
    for (const [name, story] of Object.entries(STORIES) as [string, Storyboard][]) {
      const parsed = parseStoryboard(toStoryboardJSON(story))
      expect(Math.round(storyDuration(parsed)), name).toBe(Math.round(storyDuration(story)))
    }
  })
})

describe('parse errors', () => {
  const cases: [string, unknown, RegExp][] = [
    ['not an object', 42, /expected an object/],
    ['missing beats', {}, /beats: expected an array/],
    ['empty beats', { beats: [] }, /is empty/],
    ['empty beat', { beats: [{}] }, /needs "clips", "tracks", or both/],
    ['unknown clip', { beats: [{ clips: ['wiggle'] }] }, /unknown clip "wiggle"/],
    ['tracks without duration', { beats: [{ tracks: { all: [{ at: 0 }] } }] }, /no "duration"/],
    [
      'unknown track target',
      { beats: [{ duration: 100, tracks: { elbow: [{ at: 0 }] } }] },
      /not a track target/,
    ],
    [
      'keyframe without at',
      { beats: [{ duration: 100, tracks: { all: [{ dy: 1 }] } }] },
      /missing "at"/,
    ],
    [
      'bad ease',
      { beats: [{ duration: 100, tracks: { all: [{ at: 0, ease: 'bouncy' }] } }] },
      /expected one of hold, linear/,
    ],
    [
      'absurd offset',
      { beats: [{ duration: 100, tracks: { all: [{ at: 0, dy: 5000 }] } }] },
      /must be between/,
    ],
    [
      'too many beats',
      { beats: Array.from({ length: 40 }, () => ({ clips: ['bob'] })) },
      /limit is 32/,
    ],
  ]

  it.each(cases)('rejects %s', (_name, value, pattern) => {
    expect(() => parseStoryboard(value)).toThrow(pattern)
  })

  it('names the exact path that is wrong', () => {
    expect(() =>
      parseStoryboard({
        beats: [{ clips: ['bob'] }, { duration: 100, tracks: { eyes: [{ at: 0, ease: 'nope' }] } }],
      }),
    ).toThrow(/beats\[1\]\.tracks\.eyes\[0\]\.ease/)
  })

  it('reports a JSON syntax error without leaking a stack', () => {
    expect(() => parseStoryboardText('{ beats: }')).toThrow(/not valid JSON/)
  })
})

describe('semantic validation', () => {
  /**
   * Shape and meaning are checked separately: no JSON Schema can know that
   * `part: "wings"` has to name an eyes part this library contains, so parsing
   * succeeds and `validateStory` is what catches it.
   */
  it('parses a storyboard whose part swap does not exist, then rejects it', () => {
    const story = parseStoryboard({
      beats: [{ duration: 200, tracks: { eyes: [{ at: 0, part: 'wings' }] } }],
    })
    expect(() => validateStory(story, defaultEngine.library)).toThrow(/eyes "wings"/)
  })

  it('renders a parsed storyboard end to end', () => {
    const story = parseStoryboard({
      beats: [
        {
          duration: 300,
          tracks: {
            all: [
              { at: 0, dy: 6 },
              { at: 200, dy: 0, ease: 'linear' },
            ],
          },
        },
        { clips: ['bob', 'blinkTwice'] },
      ],
    })
    const frames = defaultEngine.renderStory(defaultEngine.generate('x'), story)
    expect(frames.length).toBeGreaterThan(3)
    for (const frame of frames) expect(frame.ms).toBeGreaterThan(0)
  })
})

describe('STORYBOARD_SCHEMA', () => {
  // The schema is what an agent sees; the parser is what enforces the rules.
  // They are written by hand, so this pins the places they must agree.
  it('describes the same top-level shape the parser requires', () => {
    expect(STORYBOARD_SCHEMA.required).toEqual(['beats'])
    expect(Object.keys(STORYBOARD_SCHEMA.properties)).toEqual(['beats', 'loop'])
  })

  it('offers every field the parser accepts on a beat', () => {
    expect(Object.keys(STORYBOARD_SCHEMA.properties.beats.items.properties).sort()).toEqual(
      ['clips', 'duration', 'hold', 'repeat', 'reverse', 'speed', 'tracks'].sort(),
    )
  })

  it('lists every pose target as a track', () => {
    const targets = Object.keys(
      STORYBOARD_SCHEMA.properties.beats.items.properties.tracks.properties,
    )
    expect(targets).toContain('all')
    expect(targets).toContain('eyes')
  })

  it('agrees with the parser on the beat limit', () => {
    const max = STORYBOARD_SCHEMA.properties.beats.maxItems
    expect(() =>
      parseStoryboard({ beats: Array.from({ length: max }, () => ({ clips: ['bob'] })) }),
    ).not.toThrow()
    expect(() =>
      parseStoryboard({ beats: Array.from({ length: max + 1 }, () => ({ clips: ['bob'] })) }),
    ).toThrow(/limit/)
  })
})

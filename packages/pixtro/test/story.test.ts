import { describe, expect, it } from 'vitest'
import {
  createEngine,
  defaultEngine,
  defineLibrary,
  type Ease,
  poseAt,
  STORIES,
  STORY_NAMES,
  type Storyboard,
  sampleStory,
  storyDuration,
  toAscii,
  validateStory,
} from '../src/core/index.ts'

const engine = defaultEngine
const genome = engine.generate('dwi-01', { eyes: 'oval', accessory: 'none' })

describe('sampling', () => {
  it('holds a pose until the next keyframe rather than tweening by default', () => {
    const story: Storyboard = {
      beats: [
        {
          clip: {
            duration: 400,
            tracks: {
              all: [
                { at: 0, dy: 0 },
                { at: 200, dy: 10 },
              ],
            },
          },
        },
      ],
    }
    expect(poseAt(story, 0).all?.dy).toBe(0)
    expect(poseAt(story, 199).all?.dy).toBe(0)
    expect(poseAt(story, 200).all?.dy).toBe(10)
  })

  it('spaces an eased tween by its curve instead of evenly', () => {
    const quarterWay = (ease: Ease) =>
      poseAt(
        {
          beats: [
            {
              clip: {
                duration: 400,
                tracks: {
                  all: [
                    { at: 0, dy: 0 },
                    { at: 400, dy: 4, ease },
                  ],
                },
              },
            },
          ],
        },
        100,
      ).all?.dy

    // Four pixels, a quarter of the way through. The curve decides how many of
    // them have been spent by now — which at this size *is* the animation.
    expect(quarterWay('easeOut')).toBe(2)
    expect(quarterWay('linear')).toBe(1)
    expect(quarterWay('easeIn')).toBe(0)
  })

  it('emits frames a GIF can express: 10ms grid, nothing under 20ms', () => {
    // A delay is written in hundredths of a second and decoders clamp anything
    // under two of them up to a tenth, so a stray 14ms frame would not play for
    // 14ms — it would play for 100 and drag the whole animation with it.
    for (const name of STORY_NAMES) {
      for (const frame of sampleStory(STORIES[name])) {
        expect(frame.ms % 10).toBe(0)
        expect(frame.ms).toBeGreaterThanOrEqual(20)
      }
    }
  })

  // Every story but `entrance`, whose slide covers several pixels a frame and
  // therefore lags by more than one.
  it.each(['idle', 'alive', 'curious', 'wake'] as const)(
    'drags the accessory behind the body in %s, never ahead of it',
    (name) => {
      let current = 0
      let previous = 0
      for (const frame of sampleStory(STORIES[name])) {
        const body = frame.poses.all?.dy ?? 0
        if (body !== current) {
          previous = current
          current = body
        }
        // The hat is somewhere between where the body is now and where it
        // just was — trailing along the same path. Outside that span the lag
        // has become a lead, which reads as a jump.
        const hat = body + (frame.poses.accessory?.dy ?? 0)
        expect(hat).toBeGreaterThanOrEqual(Math.min(current, previous))
        expect(hat).toBeLessThanOrEqual(Math.max(current, previous))
      }
    },
  )

  it('never lifts an accessory off the head except on an impact', () => {
    // Accessories sit flush, so an accessory *above* the body opens a gap and
    // reads as the hat coming off. Only the landing in `bounce` gets to do it.
    for (const name of ['idle', 'alive', 'curious'] as const) {
      for (const frame of sampleStory(STORIES[name])) {
        expect(frame.poses.accessory?.dy ?? 0).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('tweens and rounds to whole pixels when asked', () => {
    const story: Storyboard = {
      beats: [
        {
          clip: {
            duration: 400,
            tracks: {
              all: [
                { at: 0, dy: 0 },
                { at: 200, dy: 10, ease: 'linear' },
              ],
            },
          },
        },
      ],
    }
    expect(poseAt(story, 100).all?.dy).toBe(5)
    expect(Number.isInteger(poseAt(story, 137).all?.dy)).toBe(true)
  })

  /**
   * The reason sampling is event-driven rather than fixed-rate: a long hold has
   * to cost one frame, not one per tick. This is what keeps exported GIFs small.
   */
  it('collapses a long hold into a single frame', () => {
    const story: Storyboard = {
      beats: [{ clip: { duration: 5000, tracks: { all: [{ at: 0, dy: 0 }] } } }],
    }
    const frames = sampleStory(story)
    expect(frames).toHaveLength(1)
    expect(frames[0]?.ms).toBe(5000)
  })

  it('merges consecutive frames that resolve to the same pose', () => {
    const story: Storyboard = {
      beats: [
        {
          clip: {
            duration: 300,
            tracks: {
              all: [
                { at: 0, dy: 1 },
                { at: 100, dy: 1 },
                { at: 200, dy: 1 },
              ],
            },
          },
        },
      ],
    }
    expect(sampleStory(story)).toHaveLength(1)
  })

  it('preserves total duration across the frame list', () => {
    for (const name of STORY_NAMES) {
      const story = STORIES[name]
      const total = sampleStory(story).reduce((n, frame) => n + frame.ms, 0)
      expect(Math.abs(total - storyDuration(story))).toBeLessThanOrEqual(2)
    }
  })
})

describe('beats', () => {
  const unit = (dy: number, duration = 100): Storyboard['beats'][number] => ({
    clip: { duration, tracks: { all: [{ at: 0, dy }] } },
  })

  it('plays beats in sequence', () => {
    const story: Storyboard = { beats: [unit(0), unit(5)] }
    expect(poseAt(story, 50).all?.dy).toBe(0)
    expect(poseAt(story, 150).all?.dy).toBe(5)
    expect(storyDuration(story)).toBe(200)
  })

  it('repeats a beat', () => {
    expect(storyDuration({ beats: [{ ...unit(0), repeat: 3 }] })).toBe(300)
  })

  it('holds the final pose through a trailing hold', () => {
    const story: Storyboard = { beats: [{ ...unit(7), hold: 500 }] }
    expect(storyDuration(story)).toBe(600)
    expect(poseAt(story, 550).all?.dy).toBe(7)
  })

  it('scales time with speed', () => {
    expect(storyDuration({ beats: [{ ...unit(0), speed: 2 }] })).toBe(50)
  })

  it('layers clips so their tracks run in parallel', () => {
    const story: Storyboard = {
      beats: [
        {
          clip: [
            { duration: 200, tracks: { all: [{ at: 0, dy: 3 }] } },
            { duration: 200, tracks: { eyes: [{ at: 0, part: 'blink' }] } },
          ],
        },
      ],
    }
    const poses = poseAt(story, 100)
    expect(poses.all?.dy).toBe(3)
    expect(poses.eyes?.part).toBe('blink')
  })
})

describe('rendering', () => {
  it('offsets the whole sprite for an `all` track', () => {
    const rest = engine.compose(genome)
    const lifted = engine.compose(genome, { poses: { all: { dy: -1 } } })
    expect(toAscii(lifted).split('\n').slice(0, -1)).toEqual(toAscii(rest).split('\n').slice(1))
  })

  it('swaps only the targeted slot', () => {
    const open = engine.compose(genome)
    const closed = engine.compose(genome, { poses: { eyes: { part: 'blink' } } })
    const ink = (grid: { px: Uint8Array }) => [...grid.px].filter((slot) => slot === 8).length
    expect(ink(closed)).toBeLessThan(ink(open))
  })

  it('hides a slot', () => {
    const withEyes = engine.compose(genome)
    const without = engine.compose(genome, { poses: { eyes: { hidden: true } } })
    expect(toAscii(without)).not.toBe(toAscii(withEyes))
  })

  it('renders every built-in story to at least one frame', () => {
    for (const name of STORY_NAMES) {
      const frames = engine.renderStory(genome, name)
      expect(frames.length).toBeGreaterThan(0)
      for (const frame of frames) expect(frame.ms).toBeGreaterThan(0)
    }
  })
})

describe('validateStory', () => {
  /**
   * A story authored against the built-ins swaps in `blink` and `sleepy`. A
   * runtime library need not have either, so this fails up front and names the
   * missing part instead of throwing halfway through a render.
   */
  it('rejects a part swap the library cannot satisfy', () => {
    const library = defineLibrary(
      {},
      { ...defaultEngine.library, eyes: { dot: defaultEngine.library.eyes.dot as never } },
    )
    expect(() => validateStory(STORIES.wake, library)).toThrow(/eyes "sleepy"/)
  })

  it('accepts a story whose swaps all exist', () => {
    expect(() => validateStory(STORIES.alive)).not.toThrow()
  })

  it('surfaces through renderStory', () => {
    const engineWithoutBlink = createEngine(
      defineLibrary(
        {},
        { ...defaultEngine.library, eyes: { dot: defaultEngine.library.eyes.dot as never } },
      ),
    )
    const g = engineWithoutBlink.generate('x')
    expect(() => engineWithoutBlink.renderStory(g, 'blink')).toThrow(/does not have/)
  })
})

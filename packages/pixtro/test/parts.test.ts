import { describe, expect, it } from 'vitest'
import {
  ACCESSORIES,
  BODIES,
  compose,
  EYES,
  type Genome,
  MOUTHS,
  type Part,
  SLOT,
  SLOT_CHARS,
} from '../src/core/index.ts'

/**
 * The art library is plain text, so a typo is a data bug rather than a compile
 * error. These checks are what catch a short row or a stray character before it
 * reaches a render.
 */

const named = <T>(registry: Readonly<Record<string, T>>): [string, T][] => Object.entries(registry)

const ALL_PARTS: [string, Pick<Part, 'w' | 'h' | 'px'>][] = [
  ...named(BODIES),
  ...named(EYES),
  ...named(MOUTHS),
  ...named(ACCESSORIES),
]

describe('part data', () => {
  it.each(ALL_PARTS)('%s has the row count it declares', (_name, part) => {
    expect(part.px).toHaveLength(part.h)
  })

  it.each(ALL_PARTS)('%s has rows of uniform declared width', (_name, part) => {
    for (const row of part.px) expect(row).toHaveLength(part.w)
  })

  it.each(ALL_PARTS)('%s uses only slot characters', (_name, part) => {
    for (const row of part.px) {
      for (const char of row) expect(SLOT_CHARS).toContain(char)
    }
  })
})

describe('bodies', () => {
  it.each(named(BODIES))('%s keeps every anchor inside the canvas', (_name, body) => {
    for (const anchor of Object.values(body.anchors)) {
      expect(anchor.x).toBeGreaterThanOrEqual(0)
      expect(anchor.x).toBeLessThan(32)
      expect(anchor.y).toBeGreaterThanOrEqual(0)
      expect(anchor.y).toBeLessThan(32)
    }
  })

  it.each(named(BODIES))('%s fits on the canvas', (_name, body) => {
    expect(body.x + body.w).toBeLessThanOrEqual(32)
    expect(body.y + body.h).toBeLessThanOrEqual(32)
  })
})

/**
 * Every body crossed with every pair of eyes.
 *
 * Face parts are 9-11px wide and center on the `face` anchor, which is the one
 * constraint that couples an otherwise body-agnostic part to the body it lands
 * on: a head narrower than the eyes leaves ink hanging in mid-air. That is a
 * silent failure — it renders, it just looks broken — so it needs a test rather
 * than a review.
 */
describe('faces land on the body they attach to', () => {
  const cases = named(BODIES).flatMap(([bodyName]) =>
    named(EYES).map(([eyesName]) => [bodyName, eyesName] as const),
  )

  it.each(cases)('%s wearing %s eyes', (body, eyes) => {
    const genome: Genome = {
      seed: 'fit',
      body,
      eyes,
      mouth: 'smile',
      accessory: 'none',
      palette: 'ember',
    }
    // The body alone. Hiding the face parts is what `poses` are for, and it is
    // the only way to get a grid with no ink in it to compare against.
    const bare = compose(genome, {
      poses: { eyes: { hidden: true }, mouth: { hidden: true }, accessory: { hidden: true } },
    })
    const worn = compose(genome)

    for (let i = 0; i < worn.px.length; i++) {
      const slot = worn.px[i] as number
      if (slot !== SLOT.ink && slot !== SLOT.white) continue
      const under = bare.px[i] as number
      const x = i % worn.w
      const y = Math.floor(i / worn.w)
      expect(
        under === SLOT.empty ? `${body}/${eyes}: face pixel at (${x}, ${y}) is off the body` : 'ok',
      ).toBe('ok')
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  type Body,
  createEngine,
  DEFAULT_LIBRARY,
  defineLibrary,
  EMPTY_BASE,
  LibraryError,
  type Part,
  toAscii,
} from '../src/core/index.ts'

const tophat: Part = {
  tags: ['tophat', 'formal', 'gentleman'],
  anchor: 'top',
  w: 9,
  h: 5,
  align: 'bottom',
  dy: 1,
  px: ['..ooooo..', '..oHHBo..', '..oHHBo..', 'ooooooooo', 'ooooooooo'],
}

/** The smallest thing that counts as a body: four pixels and three anchors. */
const pillar: Body = {
  tags: ['pillar'],
  w: 4,
  h: 4,
  x: 14,
  y: 14,
  anchors: { face: { x: 16, y: 15 }, mouth: { x: 16, y: 17 }, top: { x: 16, y: 14 } },
  px: ['oooo', 'obbo', 'obbo', 'oooo'],
}

describe('defineLibrary', () => {
  it('layers additions onto the built-ins without losing them', () => {
    const library = defineLibrary({ accessory: { tophat } })
    expect(library.accessory).toHaveProperty('tophat')
    expect(library.accessory).toHaveProperty('crown')
    expect(library.body).toEqual(DEFAULT_LIBRARY.body)
  })

  it('lets an addition override a built-in of the same name', () => {
    const library = defineLibrary({ accessory: { crown: tophat } })
    expect(library.accessory.crown).toBe(tophat)
  })

  it('does not mutate the default library', () => {
    defineLibrary({ accessory: { tophat } })
    expect(DEFAULT_LIBRARY.accessory).not.toHaveProperty('tophat')
  })

  it('renders a custom part', () => {
    const engine = createEngine(defineLibrary({ accessory: { tophat } }))
    const genome = engine.generate('x', { body: 'blob', accessory: 'tophat' })
    expect(toAscii(engine.compose(genome))).toContain('H')
  })
})

describe('validation', () => {
  // Custom parts come from a file the engine has never seen, so every failure
  // has to name the part and the row rather than misdrawing quietly.
  it('rejects a row that does not match the declared width', () => {
    expect(() =>
      defineLibrary({ accessory: { bad: { ...tophat, px: ['..', ...tophat.px.slice(1)] } } }),
    ).toThrow(/row 0 is 2 characters, expected w=9/)
  })

  it('rejects a row count that does not match the declared height', () => {
    expect(() => defineLibrary({ accessory: { bad: { ...tophat, h: 9 } } })).toThrow(
      /declares h=9 but has 5 rows/,
    )
  })

  it('rejects characters outside the slot alphabet', () => {
    expect(() =>
      defineLibrary({
        accessory: { bad: { ...tophat, px: ['..oooZo..', ...tophat.px.slice(1)] } },
      }),
    ).toThrow(/contains "Z"/)
  })

  it('names the offending part', () => {
    expect(() => defineLibrary({ accessory: { silly: { ...tophat, h: 2 } } })).toThrow(
      /accessory "silly"/,
    )
  })

  it('rejects a body placed off-canvas', () => {
    const body = DEFAULT_LIBRARY.body.blob as Body
    expect(() => defineLibrary({ body: { huge: { ...body, x: 30 } } })).toThrow(/outside the 32×32/)
  })

  it('rejects a body missing an anchor', () => {
    const body = DEFAULT_LIBRARY.body.blob as Body
    const anchors = { face: body.anchors.face, mouth: body.anchors.mouth }
    expect(() =>
      defineLibrary({ body: { noTop: { ...body, anchors: anchors as Body['anchors'] } } }),
    ).toThrow(/missing the "top" anchor/)
  })

  it('rejects a slot where nothing can be rolled', () => {
    expect(() =>
      defineLibrary(
        { accessory: Object.fromEntries([['only', { ...tophat, weight: 0 }]]) },
        {
          ...DEFAULT_LIBRARY,
          accessory: {},
        },
      ),
    ).toThrow(/no rollable entries/)
  })

  it('throws LibraryError, not a bare Error', () => {
    expect(() => defineLibrary({ accessory: { bad: { ...tophat, h: 1 } } })).toThrow(LibraryError)
  })
})

describe('weights', () => {
  it('keeps weight-0 parts out of the roll but reachable by override', () => {
    const engine = createEngine()
    expect(engine.rollable('eyes')).not.toContain('blink')
    expect(engine.names('eyes')).toContain('blink')
    for (let i = 0; i < 200; i++) expect(engine.generate(`s${i}`).eyes).not.toBe('blink')
    expect(engine.generate('x', { eyes: 'blink' }).eyes).toBe('blink')
  })

  it('honours the weight a custom part declares', () => {
    // Weight lives on the part, so a runtime library controls its own odds.
    const engine = createEngine(
      defineLibrary({ accessory: { common: { ...tophat, weight: 1000 } } }),
    )
    const rolled = Array.from({ length: 50 }, (_, i) => engine.generate(`w${i}`).accessory)
    expect(rolled.filter((name) => name === 'common').length).toBeGreaterThan(40)
  })
})

describe('EMPTY_BASE', () => {
  it('refuses to build a library until a body is supplied', () => {
    expect(() => defineLibrary({}, EMPTY_BASE)).toThrow(LibraryError)
    expect(() => defineLibrary({}, EMPTY_BASE)).toThrow(/slot "body" is empty/)
  })

  it('needs nothing but a body, because a faceless mascot is a real choice', () => {
    const library = defineLibrary({ body: { pillar } }, EMPTY_BASE)
    expect(Object.keys(library.body)).toEqual(['pillar'])
    expect(Object.keys(library.eyes)).toEqual(['none'])
    expect(library.eyes.none?.h).toBe(0)
  })

  it('brings the palettes, since nothing renders without one', () => {
    expect(Object.keys(EMPTY_BASE.palette)).toEqual(Object.keys(DEFAULT_LIBRARY.palette))
  })

  it('lets nothing built-in leak in', () => {
    const library = defineLibrary({ body: { pillar } }, EMPTY_BASE)
    for (const name of Object.keys(DEFAULT_LIBRARY.body)) {
      expect(library.body).not.toHaveProperty(name)
    }
    expect(library.accessory).not.toHaveProperty('crown')
  })

  it('renders a mascot made only of supplied parts', () => {
    const engine = createEngine(defineLibrary({ body: { pillar } }, EMPTY_BASE))
    const genome = engine.generate('seed')
    expect(genome.body).toBe('pillar')
    expect(toAscii(engine.compose(genome))).toContain('obbo')
  })
})

import { describe, expect, it } from 'vitest'
import { type CreateBodyInput, createToolset } from '../src/tools.ts'

/**
 * A body the agent might plausibly draw: a mushroom, cap over stem. Used as the
 * known-good fixture; the tests mutate copies of it to provoke each failure.
 */
const mushroom: CreateBodyInput = {
  name: 'mushroom',
  tags: ['mushroom', 'fungus', 'toadstool'],
  x: 4,
  y: 7,
  anchors: { face: { x: 16, y: 13 }, mouth: { x: 16, y: 18 }, top: { x: 16, y: 9 } },
  px: [
    '........oooooooo........',
    '.....ooohhhhhhbbooo.....',
    '...oohhhhhbbbbbbbbboo...',
    '..ohhhhhbbbbbbbbbbbbso..',
    '.ohhhhbbbbbbbbbbbbbbsso.',
    'ohhhbbbbbbbbbbbbbbbbssso',
    'ohhbbbbbbbbbbbbbbbbsssso',
    'ohhbbbbbbbbbbbbbbbssssso',
    'obbbbbbbbbbbbbbbbsssssso',
    '.oooooooobbbbbssoooooooo',
    '........ohhbbbbso.......',
    '........ohhbbbbso.......',
    '........ohbbbbbso.......',
    '........ohbbbbsso.......',
    '........obbbbssso.......',
    '........obbbsssso.......',
    '.........oooooo.........',
  ],
}

describe('createBody', () => {
  it('adds the body and makes it reachable by name and by prompt', async () => {
    const tools = createToolset()
    const result = tools.createBody(mushroom)

    expect(result.name).toBe('mushroom')
    expect(result.body.w).toBe(24)
    expect(result.body.h).toBe(17)
    expect(result.images?.[0]?.mimeType).toBe('image/png')
    expect(tools.library.body).toHaveProperty('mushroom')
    expect(tools.engine.interpret('a forest toadstool').traits.body).toBe('mushroom')

    const mascot = await tools.generateMascot({ body: 'mushroom', eyes: 'dot' })
    expect(mascot.genome.body).toBe('mushroom')
  })

  it('derives width and height from the rows', () => {
    const tools = createToolset()
    const { body } = tools.createBody({ ...mushroom, px: ['.oo.', 'obbo', '.oo.'] })
    expect([body.w, body.h]).toEqual([4, 3])
  })

  it('normalises the name', () => {
    const tools = createToolset()
    expect(tools.createBody({ ...mushroom, name: '  Big Mushroom! ' }).name).toBe('big-mushroom')
  })

  it('replaces a body when the name is reused', () => {
    const tools = createToolset()
    tools.createBody(mushroom)
    tools.createBody({ ...mushroom, px: ['.oo.', 'obbo', '.oo.'] })
    expect(tools.library.body.mushroom?.w).toBe(4)
    expect(Object.keys(tools.additions.body ?? {})).toEqual(['mushroom'])
  })

  /**
   * The error has to name the row and the character — that message is the
   * only thing an agent gets to repair its drawing with.
   */
  it.each([
    ['a stray character', { px: ['..oo..', '.oXXo.', '..oo..'] }, /row 1 contains "X"/],
    ['a short row', { px: ['..oo..', '.obbo', '..oo..'] }, /row 1 is 5 characters, expected w=6/],
    ['placement off-canvas', { x: 20 }, /outside the 32×32 canvas/],
    [
      'an off-canvas anchor',
      { anchors: { ...mushroom.anchors, top: { x: 40, y: 2 } } },
      /anchor "top"/,
    ],
    ['a missing anchor', { anchors: { face: { x: 1, y: 1 } } as never }, /anchors\.mouth must be/],
    ['an empty name', { name: '!!!' }, /name must contain/],
  ])('rejects %s', (_label, patch, pattern) => {
    const tools = createToolset()
    expect(() => tools.createBody({ ...mushroom, ...patch })).toThrow(pattern)
  })

  it('never lets a rejected body into the library', () => {
    const tools = createToolset()
    expect(() => tools.createBody({ ...mushroom, name: 'broken', x: 30 })).toThrow()
    expect(tools.library.body).not.toHaveProperty('broken')
    expect(tools.additions).toEqual({})
  })

  it('notes when the light comes from the wrong side', () => {
    const tools = createToolset()
    const inverted = {
      ...mushroom,
      name: 'wrongway',
      px: mushroom.px.map((row) => row.replace(/h/g, 'X').replace(/s/g, 'h').replace(/X/g, 's')),
    }
    expect(tools.createBody(inverted).text).toMatch(/highlights are not up-left of shadows/)
    expect(tools.createBody(mushroom).text).not.toMatch(/Shading notes/)
  })
})

describe('createPart', () => {
  it('adds eyes that render on the blob', () => {
    const tools = createToolset()
    const result = tools.createPart({
      slot: 'eyes',
      name: 'cross',
      anchor: 'face',
      tags: ['angry'],
      px: ['ii.......ii', '.ii.....ii.', '.ii.....ii.'],
    })
    expect(result.part.w).toBe(11)
    expect(tools.library.eyes).toHaveProperty('cross')
    expect(tools.engine.interpret('angry').traits.eyes).toBe('cross')
  })

  it('rejects a slot it does not know', () => {
    const tools = createToolset()
    expect(() =>
      tools.createPart({ slot: 'body' as never, name: 'x', anchor: 'face', px: ['i'] }),
    ).toThrow(/slot must be eyes, mouth or accessory/)
  })
})

describe('session persistence', () => {
  it('reports every change and restores from it', () => {
    const snapshots: unknown[] = []
    const tools = createToolset({ onChange: (additions) => snapshots.push(additions) })
    tools.createBody(mushroom)
    tools.createPart({ slot: 'mouth', name: 'frown', anchor: 'mouth', px: ['.iii.', 'i...i'] })

    expect(snapshots).toHaveLength(2)
    const last = snapshots.at(-1) as Record<string, Record<string, unknown>>
    expect(Object.keys(last.body ?? {})).toEqual(['mushroom'])
    expect(Object.keys(last.mouth ?? {})).toEqual(['frown'])

    // Round-trip through JSON, the way a stored session would.
    const restored = createToolset({ additions: JSON.parse(JSON.stringify(last)) })
    expect(restored.library.body).toHaveProperty('mushroom')
    expect(restored.library.mouth).toHaveProperty('frown')
    expect(restored.listParts().text).toMatch(/mushroom \(created in this session\)/)
  })

  it('does not leak additions between toolsets', () => {
    const a = createToolset()
    a.createBody(mushroom)
    expect(createToolset().library.body).not.toHaveProperty('mushroom')
  })
})

describe('partFormat', () => {
  it('teaches the alphabet, the light rule, anchors, and gives a worked example', () => {
    const text = createToolset().partFormat().text
    for (const needle of [
      'transparent',
      'highlight',
      'UPPER LEFT',
      'face',
      'mouth',
      'top',
      '"blob"',
    ]) {
      expect(text, needle).toContain(needle)
    }
  })
})

describe('freehand mode', () => {
  it('starts with no body, and says so instead of rendering a blank', async () => {
    const tools = createToolset({ freehand: true })

    expect(tools.ready).toBe(false)
    expect(tools.listParts().text).toContain('Freehand mode is on')
    await expect(tools.generateMascot({ prompt: 'a retro knight' })).rejects.toThrow(
      /create_body before rendering/,
    )
  })

  it('hides the built-ins even by explicit name', async () => {
    const tools = createToolset({ freehand: true })
    tools.createBody(mushroom)

    expect(tools.engine.names('body')).toEqual(['mushroom'])
    await expect(tools.generateMascot({ body: 'blob' })).rejects.toThrow(/unknown body "blob"/)
    await expect(tools.generateMascot({ accessory: 'crown' })).rejects.toThrow(
      /unknown accessory "crown"/,
    )
  })

  it('renders once a body exists, out of drawn parts only', async () => {
    const tools = createToolset({ freehand: true })
    tools.createBody(mushroom)

    const result = await tools.generateMascot({ prompt: 'a toadstool' })
    expect(result.genome.body).toBe('mushroom')
    expect(result.genome.eyes).toBe('none')
    expect(result.images?.[0]?.mimeType).toBe('image/png')
  })

  it('previews a new part on a body from this session, not on the blob', () => {
    const tools = createToolset({ freehand: true })
    tools.createBody(mushroom)

    const result = tools.createPart({
      slot: 'eyes',
      name: 'pips',
      anchor: 'face',
      px: ['i...i'],
      tags: ['pips'],
    })
    expect(result.text).toContain('On the "mushroom" body')
  })

  it('keeps the built-ins when it is off', async () => {
    const tools = createToolset()
    expect(tools.ready).toBe(true)
    expect(tools.engine.names('body')).toContain('blob')
    expect(tools.listParts().text).not.toContain('Freehand mode is on')
  })
})

describe('part_format', () => {
  it('teaches the figure proportions, since the face parts constrain them', () => {
    const text = createToolset().partFormat().text
    expect(text).toContain('Drawing a character rather than a single mass')
    expect(text).toMatch(/two heads tall/i)
    expect(text).toContain('accent ramp (S/B/H) for clothing')
  })
})

describe('built-in storyboards against a library that cannot play them', () => {
  /**
   * `alive` blinks and blinking swaps in the `blink` eyes, which a freehand
   * library does not have. Defaulting to it would throw in the *caller's*
   * renderer — the studio panel draws from the artifact, not from our PNG.
   */
  it('falls back to a story the library can actually play', async () => {
    const tools = createToolset({ freehand: true })
    tools.createBody(mushroom)

    expect(tools.defaultStory()).toBe('idle')
    const result = await tools.renderAnimation({ body: 'mushroom' })
    expect(result.story).toBe('idle')
  })

  it('still prefers the liveliest one when the parts are there', () => {
    expect(createToolset().defaultStory()).toBe('alive')
  })

  it('names what is playable when an unplayable built-in is asked for', async () => {
    const tools = createToolset({ freehand: true })
    tools.createBody(mushroom)

    await expect(tools.renderAnimation({ story: 'wake' })).rejects.toThrow(
      /Playable here: still, idle/,
    )
  })

  it('lists only the playable built-ins', () => {
    const tools = createToolset({ freehand: true })
    tools.createBody(mushroom)

    const text = tools.listParts().text
    expect(text).toContain('Built-in storyboards: still, idle')
    expect(text).not.toContain('blinkTwice')
  })
})

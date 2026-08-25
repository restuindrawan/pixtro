import { describe, expect, it } from 'vitest'
import {
  CANVAS,
  compose,
  defaultEngine,
  generate,
  paletteFor,
  render,
  toAscii,
  upscale,
} from '../src/core/index.ts'

/**
 * The art snapshots below are the real regression net. Because parts are
 * authored as text and the composer outputs text, a change to any part shows up
 * here as a readable diff — no image fixtures, no perceptual thresholds.
 */
describe('composition', () => {
  it('renders a blob', () => {
    const genome = generate('x', {
      body: 'blob',
      eyes: 'oval',
      mouth: 'smile',
      accessory: 'none',
      palette: 'ember',
    })
    expect(`\n${toAscii(compose(genome))}\n`).toMatchInlineSnapshot(`
      "
      ................................
      ................................
      ................................
      ................................
      ................................
      ................................
      ................................
      ................................
      ................................
      ................................
      .............oooooo.............
      ...........oohhhhbboo...........
      .........oohhhhbbbbbboo.........
      ........ohhhhbbbbbbbbbbo........
      .......ohhhhbbbbbbbbbbbso.......
      ......ohhhhbbbbbbbbbbbbsso......
      ......ohhhhbbbbbbbbbbbbsso......
      .....ohhhhbbbbbbbbbbbbbssso.....
      .....ohhhbbbiibbbbbiibbssso.....
      .....ohhhbbbiibbbbbiibbssso.....
      .....ohhhbbbiibbbbbiibsssso.....
      .....ohhhbbbbbbbbbbbbbsssso.....
      .....ohhbbbbbbbbbbbbbbsssso.....
      .....ohhbbbbbbibbbibbssssso.....
      .....ohhbbbbbbbiiibbbssssso.....
      .....ohbbbbbbbbbbbbbsssssso.....
      ......ohbbbbbbbbbbbsssssso......
      ......obbbbbbbbbbsssssssso......
      .......oobbbbssssssssssoo.......
      .........oooooooooooooo.........
      ................................
      ................................
      "
    `)
  })

  it('renders a tall body with a crown', () => {
    const genome = generate('x', {
      body: 'tall',
      eyes: 'sleepy',
      mouth: 'none',
      accessory: 'crown',
      palette: 'sea',
    })
    expect(`\n${toAscii(compose(genome))}\n`).toMatchInlineSnapshot(`
      "
      ................................
      ................................
      ................................
      ............o...o...o...........
      ...........oHo.oHo.oHo..........
      ...........oHHHBBBBBBo..........
      ...........ooooooooooo..........
      ...........oohhhbbboo...........
      ..........ohhhbbbbbbbo..........
      .........ohhhbbbbbbbbso.........
      .........ohhhbbbbbbbsso.........
      ........ohhhbbbbbbbbbsso........
      ........ohhhbbbbbbbbbsso........
      ........ohhhbbbbbbbbbsso........
      ........ohhbbbbbbbbbbsso........
      ........ohhiiibbbbbiiiso........
      ........ohhbibbbbbbbisso........
      ........ohhbbbbbbbbbssso........
      ........ohbbbbbbbbbsssso........
      ........ohbbbbbbbbbsssso........
      ........ohbbbbbbbbssssso........
      ........ohbbbbbbbbssssso........
      ........obbbbbbbbbssssso........
      ........obbbbbbbbbssssso........
      ........obbbbbbbbsssssso........
      ........obbbbbbbssssssso........
      ........obbbbbssssssssso........
      .........obbbssssssssso.........
      ..........oobsssssssoo..........
      ............oooooooo............
      ................................
      ................................
      "
    `)
  })
})

describe('render', () => {
  it('produces a full RGBA buffer at canvas size', () => {
    const image = render(generate('dwi-01'))
    expect(image.w).toBe(CANVAS)
    expect(image.h).toBe(CANVAS)
    expect(image.data).toHaveLength(CANVAS * CANVAS * 4)
  })

  it('leaves background pixels fully transparent', () => {
    const image = render(generate('dwi-01'))
    expect(image.data[3]).toBe(0) // top-left corner is always empty
  })

  it('recolors without changing a single pixel of shape', () => {
    const a = generate('dwi-01', { palette: 'ember' })
    const b = generate('dwi-01', { palette: 'gameboy' })
    expect(toAscii(compose(a))).toBe(toAscii(compose(b)))
  })

  it('scales by whole pixels only', () => {
    expect(() => defaultEngine.compose(generate('x'), { scale: 1.5 })).toThrow(/positive integer/)
    expect(() => defaultEngine.compose(generate('x'), { scale: 0 })).toThrow(/positive integer/)
  })

  it('upscales without introducing new colors', () => {
    const grid = compose(generate('dwi-01'))
    const big = upscale(grid, 4)
    expect(big.w).toBe(CANVAS * 4)
    expect(new Set(big.px)).toEqual(new Set(grid.px))
  })
})

describe('stories', () => {
  it('bobs the sprite without changing its content', () => {
    const genome = generate('dwi-01', { accessory: 'none' })
    const [rest, settled] = defaultEngine.renderStory(genome, 'idle')
    if (!rest || !settled) throw new Error('idle clip should have frames')
    // The idle settles downward — a `tall` body in a `hat` already touches the
    // top of the canvas, so there is nowhere to float up to. One pixel down is
    // exactly the resting frame shifted one row.
    const restRows = toAscii(rest.grid).split('\n')
    const settledRows = toAscii(settled.grid).split('\n')
    expect(settledRows.slice(1)).toEqual(restRows.slice(0, -1))
  })

  it('loops the idle without a jump at the seam', () => {
    const genome = generate('dwi-01', { accessory: 'hat' })
    for (const name of ['idle', 'alive', 'blink'] as const) {
      const frames = defaultEngine.renderStory(genome, name)
      const first = frames[0]
      const last = frames.at(-1)
      if (!first || !last) throw new Error(`${name} should have frames`)
      // A looping clip has to come back to the pose it started in, or every
      // cycle ends with a pop.
      expect([...last.grid.px]).toEqual([...first.grid.px])
    }
  })

  it('drops frames that draw the same pixels for this genome', () => {
    // The idle lags the accessory a pixel behind the body. A mascot with no
    // accessory cannot show that, and should not pay frames for it.
    const total = (frames: { ms: number }[]) => frames.reduce((sum, f) => sum + f.ms, 0)
    const withHat = defaultEngine.renderStory(generate('dwi-01', { accessory: 'hat' }), 'idle')
    const without = defaultEngine.renderStory(generate('dwi-01', { accessory: 'none' }), 'idle')

    expect(without.length).toBeLessThan(withHat.length)
    expect(total(without)).toBe(total(withHat))
  })

  it('closes the eyes on blink frames', () => {
    const genome = generate('dwi-01', { eyes: 'oval' })
    const frames = defaultEngine.renderStory(genome, 'blink')
    const inkPixels = (index: number) =>
      [...(frames[index]?.grid.px ?? [])].filter((slot) => slot === 8).length
    expect(inkPixels(1)).toBeLessThan(inkPixels(0))
  })
})

describe('palette', () => {
  /** Hue in degrees, ignoring saturation and lightness. */
  const hueOf = ([r, g, b]: readonly number[]): number => {
    const [R, G, B] = [(r as number) / 255, (g as number) / 255, (b as number) / 255]
    const max = Math.max(R, G, B)
    const min = Math.min(R, G, B)
    if (max === min) return 0
    const d = max - min
    const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    return (h * 60 + 360) % 360
  }

  /** Shortest angular distance between two hues, 0..180. */
  const arc = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

  // The rule that separates hand-picked ramps from muddy generated ones:
  // shadows rotate toward a cool anchor and highlights toward a warm one. It
  // has to hold for *any* base hue, which is why both a warm and a cool palette
  // are checked — a naive fixed-direction shift breaks on one of them.
  it.each([
    ['ember', 'warm terracotta'],
    ['moss', 'cool green'],
  ] as const)('rotates %s (%s) toward the right anchors', (name, _description) => {
    const [, , shadow, base, highlight] = paletteFor(generate('x', { palette: name }))
    if (!shadow || !base || !highlight) throw new Error('palette is missing entries')

    expect(arc(hueOf(shadow), 265)).toBeLessThan(arc(hueOf(base), 265))
    expect(arc(hueOf(highlight), 50)).toBeLessThan(arc(hueOf(base), 50))
  })

  it('still darkens shadows and lightens highlights', () => {
    const [, , shadow, base, highlight] = paletteFor(generate('x', { palette: 'ember' }))
    const luma = (c: readonly number[] = []) =>
      0.299 * (c[0] as number) + 0.587 * (c[1] as number) + 0.114 * (c[2] as number)
    expect(luma(shadow)).toBeLessThan(luma(base))
    expect(luma(highlight)).toBeGreaterThan(luma(base))
  })

  it('keeps slot 0 fully transparent in every palette', () => {
    for (const name of ['ember', 'gameboy', 'dusk'] as const) {
      expect(paletteFor(generate('x', { palette: name }))[0]?.[3]).toBe(0)
    }
  })
})

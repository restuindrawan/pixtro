import { describe, expect, it } from 'vitest'
import { ACCESSORIES, BODIES, EYES, generate, MOUTHS, PALETTES } from '../src/core/index.ts'

describe('generate', () => {
  it('is deterministic', () => {
    expect(generate('dwi-01')).toEqual(generate('dwi-01'))
  })

  it('gives different seeds different mascots', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const shapes = new Set(seeds.map((s) => JSON.stringify(generate(s, { palette: 'ember' }))))
    expect(shapes.size).toBeGreaterThan(1)
  })

  it('accepts any string, including empty and unicode', () => {
    for (const seed of ['', ' ', '🦀', 'a'.repeat(500)]) {
      expect(() => generate(seed)).not.toThrow()
    }
  })

  it('only ever picks names that exist', () => {
    for (let i = 0; i < 300; i++) {
      const g = generate(`seed-${i}`)
      expect(BODIES).toHaveProperty(g.body)
      expect(EYES).toHaveProperty(g.eyes)
      expect(MOUTHS).toHaveProperty(g.mouth)
      expect(ACCESSORIES).toHaveProperty(g.accessory)
      expect(PALETTES).toHaveProperty(g.palette)
    }
  })

  it('never rolls the clip-only blink eyes', () => {
    for (let i = 0; i < 300; i++) {
      expect(generate(`seed-${i}`).eyes).not.toBe('blink')
    }
  })

  it('overriding one trait leaves the others alone', () => {
    const base = generate('dwi-01')
    const recolored = generate('dwi-01', { palette: 'gameboy' })
    expect(recolored.palette).toBe('gameboy')
    expect({ ...recolored, palette: base.palette }).toEqual(base)
  })

  it('rejects unknown trait names', () => {
    expect(() => generate('x', { eyes: 'laser' })).toThrow(/unknown eyes "laser"/)
  })
})

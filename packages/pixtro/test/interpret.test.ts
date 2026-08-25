import { describe, expect, it } from 'vitest'
import {
  createEngine,
  defaultEngine,
  defineLibrary,
  interpret,
  seedFromPrompt,
  tokenize,
} from '../src/core/index.ts'

describe('tokenize', () => {
  it('drops stopwords and punctuation', () => {
    expect(tokenize('a very sleepy, wizard-like blob!')).toEqual(['sleepy', 'wizard', 'blob'])
  })
})

describe('interpret', () => {
  it('reads a whole prompt across slots', () => {
    const { traits } = interpret('a sleepy wizard blob')
    expect(traits).toMatchObject({ body: 'blob', eyes: 'sleepy', accessory: 'hat' })
    // "wizard" tags the purple palette as well as the hat — one word is allowed
    // to influence more than one slot.
    expect(traits.palette).toBe('dusk')
  })

  it('leaves unmentioned slots unset so the seed still decides them', () => {
    expect(interpret('gameboy').traits).toEqual({ palette: 'gameboy' })
  })

  it('matches a part by its own name, not just its tags', () => {
    expect(interpret('sparkle').traits.eyes).toBe('sparkle')
  })

  it('is deterministic', () => {
    expect(interpret('a grumpy robot')).toEqual(interpret('a grumpy robot'))
  })

  it('reports only words that matched nothing at all', () => {
    // "royal" tags the crown, which loses the accessory slot to "robot"'s
    // antenna. It was still understood, so it must not be listed as ignored.
    const read = interpret('a cheerful royal robot')
    expect(read.unused).not.toContain('royal')
    expect(interpret('a blob riding a skateboard').unused).toContain('skateboard')
  })

  it('survives a prompt with nothing usable in it', () => {
    const read = interpret('xyzzy plugh')
    expect(read.traits).toEqual({})
    expect(read.matches).toEqual([])
  })

  it('picks up tags from a runtime library', () => {
    // The lexicon is not a fixed list — a custom part brings its own words.
    const engine = createEngine(
      defineLibrary({
        accessory: {
          tophat: {
            tags: ['tophat', 'formal', 'gentleman', 'dapper'],
            anchor: 'top',
            w: 9,
            h: 5,
            align: 'bottom',
            dy: 1,
            px: ['..ooooo..', '..oHHBo..', '..oHHBo..', 'ooooooooo', 'ooooooooo'],
          },
        },
      }),
    )
    expect(engine.interpret('a dapper gentleman').traits.accessory).toBe('tophat')
    // The same prompt means nothing to the default library.
    expect(defaultEngine.interpret('a dapper gentleman').traits.accessory).toBeUndefined()
  })
})

describe('fromPrompt', () => {
  it('is stable for the same prompt', () => {
    expect(defaultEngine.fromPrompt('a happy ghost')).toEqual(
      defaultEngine.fromPrompt('a happy ghost'),
    )
  })

  it('ignores wording that does not change the tokens', () => {
    expect(seedFromPrompt('a sleepy wizard')).toBe(seedFromPrompt('the sleepy wizard'))
  })

  it('lets an explicit override beat the prompt', () => {
    const genome = defaultEngine.fromPrompt('a sleepy blob', { eyes: 'sparkle' })
    expect(genome.eyes).toBe('sparkle')
    expect(genome.body).toBe('blob')
  })

  it('always produces a genome that resolves against the library', () => {
    for (const prompt of ['', '???', 'a', 'wizard '.repeat(50)]) {
      expect(() => defaultEngine.validate(defaultEngine.fromPrompt(prompt))).not.toThrow()
    }
  })
})

describe('character prompts', () => {
  /**
   * The failure this guards against is subtle and was the whole reason `hero`
   * exists: "knight" used to match nothing in the body slot, so the seed rolled
   * a blob and the only knightly thing about the result was the accessory.
   */
  it('reads a character as a shape, not just as a costume', () => {
    const { traits } = interpret('a retro knight')
    expect(traits.body).toBe('hero')
    expect(traits.accessory).toBe('helm')
  })

  it.each(['a brave hero', 'a little person', 'a soldier', 'a humanoid figure'])(
    'puts %j on a figure rather than a blob',
    (prompt) => {
      expect(interpret(prompt).traits.body).toBe('hero')
    },
  )
})

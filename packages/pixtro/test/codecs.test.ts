import { describe, expect, it } from 'vitest'
import { toGIF } from '../src/codecs/gif.ts'
import { toPNG } from '../src/codecs/png.ts'
import { defaultEngine, generate, paletteFor, render } from '../src/core/index.ts'

const magic = (bytes: Uint8Array, length: number) =>
  Array.from(bytes.subarray(0, length), (byte) =>
    byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.',
  ).join('')

describe('toPNG', () => {
  it('emits a PNG signature', () => {
    expect(magic(toPNG(render(generate('dwi-01'), { scale: 2 })), 8)).toBe('.PNG....')
  })
})

describe('toGIF', () => {
  const genome = generate('dwi-01')

  /**
   * This is the guard for gifenc's dual-build hazard. It resolves to a
   * different shape under Node than under a bundler, and reaching for the wrong
   * one throws `GIFEncoder is not a function` at call time.
   *
   * Note this only exercises the Node path — the bundler path can't be covered
   * from here, so `codecs/gif.ts` probes for the function at runtime rather than
   * assuming either shape.
   */
  it('emits a GIF89a header', () => {
    const bytes = toGIF(
      defaultEngine.renderStory(genome, 'alive', { scale: 2 }),
      paletteFor(genome),
    )
    expect(magic(bytes, 6)).toBe('GIF89a')
  })

  it('writes one frame per clip frame with the declared delays', () => {
    const frames = defaultEngine.renderStory(genome, 'alive', { scale: 1 })
    const bytes = toGIF(frames, paletteFor(genome))

    // Walk the block structure rather than scanning for byte pairs — 0x21 0xF9
    // occurs inside LZW data too, so a naive search overcounts.
    let p = 6
    const at = (offset: number) => bytes[offset] as number
    const u16 = () => {
      const value = at(p) | (at(p + 1) << 8)
      p += 2
      return value
    }
    const skipSubBlocks = () => {
      for (;;) {
        const size = at(p++)
        if (!size) return
        p += size
      }
    }

    u16()
    u16()
    const packed = at(p++)
    p += 2
    if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1))

    const delays: number[] = []
    let pending = 0
    for (;;) {
      const separator = at(p++)
      if (separator === 0x3b) break
      if (separator === 0x21) {
        if (at(p++) === 0xf9) pending = (at(p + 2) | (at(p + 3) << 8)) * 10
        skipSubBlocks()
        continue
      }
      if (separator === 0x2c) {
        p += 8
        const local = at(p++)
        if (local & 0x80) p += 3 * (1 << ((local & 7) + 1))
        p++
        skipSubBlocks()
        delays.push(pending)
        continue
      }
      throw new Error(`unexpected GIF block 0x${separator.toString(16)} at ${p - 1}`)
    }

    expect(delays).toEqual(frames.map((frame: { ms: number }) => frame.ms))
  })

  it('rejects an empty clip', () => {
    expect(() => toGIF([], paletteFor(genome))).toThrow(/at least one frame/)
  })
})

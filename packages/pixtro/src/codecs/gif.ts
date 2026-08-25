import * as gifencModule from 'gifenc'
import type { Frame } from '../core/engine.ts'
import type { Palette } from '../core/types.ts'

type GifencApi = Pick<typeof gifencModule, 'GIFEncoder'>

/**
 * gifenc ships three entry fields and no `exports` map, so what you get back
 * depends entirely on who is resolving it:
 *
 * - Node follows `main` to the CJS build. Its esbuild output defeats Node's
 *   named-export detection, so the API is only reachable through the default.
 * - Bundlers follow `browser`/`module`, and wrap the result in their own interop
 *   namespace whose shape differs again.
 *
 * Two things matter here. Pick whichever shape actually carries the function
 * rather than assuming one — and do it on first call, not at module scope,
 * because bundlers initialize a wrapped CJS module lazily and the namespace can
 * still be empty while this module is being evaluated.
 */
let cached: GifencApi | undefined

function gifenc(): GifencApi {
  if (cached) return cached
  const candidates = [gifencModule, (gifencModule as { default?: unknown }).default]
  for (const candidate of candidates) {
    if (typeof (candidate as GifencApi | undefined)?.GIFEncoder === 'function') {
      cached = candidate as GifencApi
      return cached
    }
  }
  throw new Error(
    `gifenc did not expose GIFEncoder (module keys: ${Object.keys(gifencModule).join(', ') || 'none'})`,
  )
}

/**
 * Animated GIF from indexed frames.
 *
 * No quantization step: our grids are already palette indices and gifenc wants
 * palette indices, so the pixels go in verbatim. Every other pipeline has to
 * render to RGB and then quantize back down, which is where generated pixel art
 * usually loses its palette.
 */
export function toGIF(frames: readonly Frame[], palette: Palette): Uint8Array {
  const first = frames[0]
  if (!first) throw new Error('toGIF() needs at least one frame')

  // gifenc wants a plain [r, g, b] table. Slot 0 stays in it as a placeholder so
  // the indices in our grids keep pointing at the right colors.
  const table = palette.map((c) => [c[0], c[1], c[2]] as [number, number, number])

  const gif = gifenc().GIFEncoder()
  for (const frame of frames) {
    gif.writeFrame(frame.grid.px, frame.grid.w, frame.grid.h, {
      palette: table,
      delay: frame.ms,
      transparent: true,
      transparentIndex: 0,
      dispose: 2,
    })
  }
  gif.finish()
  return gif.bytes()
}

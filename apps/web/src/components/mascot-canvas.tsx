'use client'

import {
  CANVAS,
  defaultEngine,
  type Engine,
  type Genome,
  type Storyboard,
  type StoryName,
  toRGBA,
} from 'pixtro/core'
import { useEffect, useRef, useState } from 'react'

type Props = {
  genome: Genome
  scale: number
  /** A built-in name or a storyboard object. Memoize the object form. */
  story: StoryName | Storyboard
  /** An engine bound to a custom library, when the genome needs parts the built-ins lack. */
  engine?: Engine | undefined
  /** The scale actually drawn, which on a narrow screen is smaller than the one asked for. */
  onScale?: ((scale: number) => void) | undefined
}

/**
 * Draws the mascot with `putImageData` at its final size.
 *
 * The engine upscales the *index* grid before any color is applied, so the
 * result is exact nearest-neighbour by construction — there is no browser
 * smoothing to fight and no `image-rendering` hint to remember. That only holds
 * while the canvas is drawn at the size it is displayed at, which is why a
 * sprite too wide for its container is re-rasterized smaller rather than left
 * for CSS to squeeze: a canvas the browser scales down is resampled, and every
 * pixel edge goes soft.
 */
export function MascotCanvas({ genome, scale, story, engine = defaultEngine, onScale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /** Zero until measured — for that one frame the asked-for scale is the best guess. */
  const [room, setRoom] = useState(0)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      // A hidden panel measures 0. Keeping the last real width means the pane
      // is already right when it comes back rather than one frame behind.
      if (width > 0) setRoom(width)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // Whole multiples only. A fractional scale is a resample by another name.
  const drawn = room > 0 ? Math.max(1, Math.min(scale, Math.floor(room / CANVAS))) : scale

  useEffect(() => {
    onScale?.(drawn)
  }, [drawn, onScale])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // Every frame is rasterized once up front, so the animation loop only ever
    // does a putImageData. The storyboard sampler already collapsed identical
    // consecutive states, so this list is as short as the animation allows.
    const palette = engine.paletteFor(genome)
    const frames = sample(engine, genome, story, drawn).map((frame) => {
      const image = toRGBA(frame.grid, palette)
      return { data: new ImageData(image.data, image.w, image.h), ms: frame.ms }
    })

    const first = frames[0]
    if (!first) return
    canvas.width = first.data.width
    canvas.height = first.data.height
    ctx.putImageData(first.data, 0, 0)
    if (frames.length === 1) return

    let index = 0
    let shownAt = performance.now()
    let raf = 0

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - shownAt < (frames[index]?.ms ?? 0)) return
      shownAt = now
      index = (index + 1) % frames.length
      const next = frames[index]
      if (next) ctx.putImageData(next.data, 0, 0)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [genome, drawn, story, engine])

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      <canvas
        ref={canvasRef}
        aria-label={`Pixel mascot for seed ${genome.seed}`}
        role="img"
        className="max-w-full"
      />
    </div>
  )
}

/**
 * Frames for a storyboard, or one still frame if it cannot be played.
 *
 * A storyboard names the parts it swaps in, and the library underneath it can
 * change: the built-in `alive` blinks, and a library assembled from parts an
 * agent drew has no `blink` eyes. Losing the motion is a far better outcome
 * than an exception out of an effect taking the page down with it.
 */
function sample(engine: Engine, genome: Genome, story: StoryName | Storyboard, scale: number) {
  try {
    return engine.renderStory(genome, story, { scale })
  } catch {
    return [{ grid: engine.compose(genome, { scale }), ms: 0 }]
  }
}

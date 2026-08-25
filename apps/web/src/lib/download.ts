import {
  defaultEngine,
  type Engine,
  type Genome,
  type Storyboard,
  type StoryName,
} from 'pixtro/core'

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * PNG comes from the browser's own encoder rather than the library's, which
 * keeps `fast-png` out of the client bundle entirely.
 *
 * Note this re-renders from the genome instead of reading the visible canvas —
 * that canvas is mid-animation, so grabbing it would export whichever frame
 * happened to be showing.
 */
export async function downloadPNG(
  genome: Genome,
  scale: number,
  engine: Engine = defaultEngine,
): Promise<void> {
  const image = engine.render(genome, { scale })
  const canvas = document.createElement('canvas')
  canvas.width = image.w
  canvas.height = image.h

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('could not get a 2d context')
  ctx.putImageData(new ImageData(image.data, image.w, image.h), 0, 0)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('the browser refused to encode a PNG')
  save(blob, `${genome.seed}.png`)
}

/**
 * GIF needs a real encoder, so `pixtro` (and with it `gifenc`) is pulled in
 * lazily — only visitors who actually export an animation pay for it.
 */
export async function downloadGIF(
  genome: Genome,
  scale: number,
  story: StoryName | Storyboard = 'alive',
  label = 'alive',
  engine: Engine = defaultEngine,
): Promise<void> {
  const { toGIF } = await import('pixtro')
  const frames = engine.renderStory(genome, story, { scale })
  const bytes = toGIF(frames, engine.paletteFor(genome))
  save(new Blob([bytes as BlobPart], { type: 'image/gif' }), `${genome.seed}-${label}.gif`)
}

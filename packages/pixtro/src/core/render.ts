import { type Grid, type Image, type Palette, type RGBA, SLOT_CHARS } from './types.ts'

/**
 * Rasterization primitives. These know nothing about genomes or libraries —
 * they take a grid and a palette. Anything library-aware lives on the `Engine`.
 */

/** Indexed grid + palette -> RGBA. The only place color enters the pipeline. */
export function toRGBA(grid: Grid, palette: Palette): Image {
  const data = new Uint8ClampedArray(grid.w * grid.h * 4)
  for (let i = 0; i < grid.px.length; i++) {
    const color = palette[grid.px[i] as number]
    if (!color) continue
    const o = i * 4
    data[o] = color[0]
    data[o + 1] = color[1]
    data[o + 2] = color[2]
    data[o + 3] = color[3]
  }
  return { w: grid.w, h: grid.h, data }
}

/**
 * Lay images out in a grid on one canvas.
 *
 * This has to work on RGBA rather than slot indices, because each mascot on a
 * contact sheet carries its own palette — the whole point is to compare them.
 */
export function tile(
  images: readonly Image[],
  columns: number,
  gap = 2,
  background: RGBA = [0, 0, 0, 0],
): Image {
  const first = images[0]
  if (!first) throw new Error('tile() needs at least one image')

  const cols = Math.max(1, Math.min(columns, images.length))
  const rows = Math.ceil(images.length / cols)
  const w = cols * first.w + (cols + 1) * gap
  const h = rows * first.h + (rows + 1) * gap
  const data = new Uint8ClampedArray(w * h * 4)

  for (let i = 0; i < data.length; i += 4) {
    data[i] = background[0]
    data[i + 1] = background[1]
    data[i + 2] = background[2]
    data[i + 3] = background[3]
  }

  images.forEach((image, i) => {
    const x0 = gap + (i % cols) * (first.w + gap)
    const y0 = gap + Math.floor(i / cols) * (first.h + gap)
    for (let y = 0; y < image.h; y++) {
      for (let x = 0; x < image.w; x++) {
        const src = (y * image.w + x) * 4
        if (image.data[src + 3] === 0) continue
        const dst = ((y0 + y) * w + x0 + x) * 4
        data.set(image.data.subarray(src, src + 4), dst)
      }
    }
  })

  return { w, h, data }
}

/**
 * Grid -> the same text alphabet the parts are authored in.
 *
 * This is the test surface. Because both the art and the snapshots are plain
 * text, an art regression shows up as a readable diff in a pull request with no
 * image tooling, no binary fixtures, and no perceptual threshold to tune.
 */
export function toAscii(grid: Grid): string {
  const rows: string[] = []
  for (let y = 0; y < grid.h; y++) {
    let row = ''
    for (let x = 0; x < grid.w; x++) {
      row += SLOT_CHARS[grid.px[y * grid.w + x] as number] ?? '?'
    }
    rows.push(row)
  }
  return rows.join('\n')
}

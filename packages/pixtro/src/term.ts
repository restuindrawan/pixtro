import type { Grid, Palette } from './core/types.ts'

/**
 * Terminal preview using half-block characters.
 *
 * Each `▀` carries two pixels — foreground is the upper row, background the
 * lower — so a 32x32 sprite prints as 32x16 characters at roughly square aspect.
 * This is the tight feedback loop: tweak a part, re-run, see the mascot, with no
 * file to open.
 */

const UPPER_HALF = '▀'
const RESET = '\x1b[0m'

/** Transparent pixels composite onto a checkerboard so you can see the alpha. */
const CHECKER: [number, number, number][] = [
  [38, 38, 42],
  [28, 28, 32],
]

function colorAt(grid: Grid, palette: Palette, x: number, y: number): [number, number, number] {
  const checker = CHECKER[((x >> 1) + (y >> 1)) % 2] as [number, number, number]
  if (y < 0 || y >= grid.h) return checker
  const color = palette[grid.px[y * grid.w + x] as number]
  if (!color || color[3] === 0) return checker
  return [color[0], color[1], color[2]]
}

export function termPreview(grid: Grid, palette: Palette): string {
  const rows: string[] = []
  for (let y = 0; y < grid.h; y += 2) {
    let row = ''
    for (let x = 0; x < grid.w; x++) {
      const [tr, tg, tb] = colorAt(grid, palette, x, y)
      const [br, bg, bb] = colorAt(grid, palette, x, y + 1)
      row += `\x1b[38;2;${tr};${tg};${tb}m\x1b[48;2;${br};${bg};${bb}m${UPPER_HALF}`
    }
    rows.push(row + RESET)
  }
  return rows.join('\n')
}

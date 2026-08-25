/**
 * Seeded, deterministic randomness. Same seed string always produces the same
 * mascot on every machine and every Node version, which is what makes seeds
 * shareable.
 */

/** cyrb128 — spreads a string into four well-mixed 32-bit words. */
function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

export type Rng = () => number

/** sfc32 — small, fast, statistically fine for picking traits. */
export function makeRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed)
  // Discard the first few outputs so similar seeds diverge immediately.
  const next: Rng = () => {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
  for (let i = 0; i < 12; i++) next()
  return next
}

/** Uniform pick from a non-empty list. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error('pick() called with an empty list')
  return item
}

/**
 * Weighted pick over a `{ name: weight }` table. Weights are relative, so
 * `{ none: 5, crown: 1 }` means "none" five times as often as "crown".
 */
export function weightedPick<T extends string>(rng: Rng, table: Readonly<Record<T, number>>): T {
  const entries = Object.entries(table) as [T, number][]
  let total = 0
  for (const [, w] of entries) total += w
  let roll = rng() * total
  for (const [name, w] of entries) {
    roll -= w
    if (roll <= 0) return name
  }
  // Only reachable through float drift on the final entry.
  const last = entries.at(-1)
  if (!last) throw new Error('weightedPick() called with an empty table')
  return last[0]
}

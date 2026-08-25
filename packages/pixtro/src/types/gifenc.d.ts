// gifenc ships no type declarations. Only the surface we actually use.
//
// Declared as named exports, matching its ESM build. The CJS build reaches the
// same API through a default export instead; `codecs/gif.ts` reconciles the two
// at runtime.
declare module 'gifenc' {
  export type GifPalette = [number, number, number][]

  export type WriteFrameOptions = {
    palette?: GifPalette
    delay?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
    repeat?: number
    first?: boolean
  }

  export type Encoder = {
    writeFrame(
      index: Uint8Array | Uint8ClampedArray | number[],
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): GifPalette
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
  ): Uint8Array
}

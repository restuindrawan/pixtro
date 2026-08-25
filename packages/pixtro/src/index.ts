/**
 * pixtro — retro pixel mascot generation engine.
 *
 * This entry point is core plus the file-format codecs. If you only need the
 * engine (browser bundles, custom encoders), import `pixtro/core` instead and
 * you get zero dependencies.
 */

export { toGIF } from './codecs/gif.ts'
export { toPNG } from './codecs/png.ts'
export * from './core/index.ts'
export { termPreview } from './term.ts'

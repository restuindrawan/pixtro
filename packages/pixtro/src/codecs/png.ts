import { encode } from 'fast-png'
import type { Image } from '../core/types.ts'

/** RGBA image -> PNG bytes. */
export function toPNG(image: Image): Uint8Array {
  return encode({
    width: image.w,
    height: image.h,
    data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length),
    channels: 4,
    depth: 8,
  })
}

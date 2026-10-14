declare module "utif" {
  export function encodeImage(
    rgba: Uint8Array | Uint8ClampedArray,
    w: number,
    h: number
  ): ArrayBuffer;
  export function decode(buffer: ArrayBuffer): unknown[];
  export function toRGBA8(ifd: unknown): Uint8Array;
}

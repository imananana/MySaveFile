import { decompress as qfsDecompress } from 'qfs-compression';

/**
 * Decompresses a RefPack (QFS) stream from a Sims 4 save file.
 * Sims 4 uses the 0x50 0xFB variant; qfs-compression expects 0x10 0xFB.
 */
export function decompressRefpack(compressed: Uint8Array): Uint8Array {
  const patched = new Uint8Array(compressed);
  if (patched[1] === 0xfb && patched[0] !== 0x10) {
    patched[0] = 0x10;
  }
  return qfsDecompress(patched);
}

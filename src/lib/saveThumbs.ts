import { DbpfResource, instanceIdHex } from './dbpf';

export interface SaveThumbnail {
  instanceId: string;
  data: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png';
}

// Resource types that contain raw image bytes (no decompression needed)
const IMAGE_TYPES = new Set([0x0f, 0x12, 0xe88db35f, 0xf8e1457a]);

const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG  = [0x89, 0x50, 0x4e, 0x47];

function detectMime(data: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (data.length < 4) return null;
  if (data[0] === JPEG_SIG[0] && data[1] === JPEG_SIG[1] && data[2] === JPEG_SIG[2]) return 'image/jpeg';
  if (data[0] === PNG_SIG[0] && data[1] === PNG_SIG[1] && data[2] === PNG_SIG[2] && data[3] === PNG_SIG[3]) return 'image/png';
  return null;
}

export function extractThumbnails(resources: DbpfResource[]): SaveThumbnail[] {
  const thumbs: SaveThumbnail[] = [];
  for (const r of resources) {
    if (!IMAGE_TYPES.has(r.type)) continue;
    const mime = detectMime(r.data);
    if (!mime) continue;
    thumbs.push({
      instanceId: instanceIdHex(r),
      data: r.data,
      mimeType: mime,
    });
  }
  return thumbs;
}

export function thumbnailToObjectURL(thumb: SaveThumbnail): string {
  const copy = new Uint8Array(thumb.data).buffer as ArrayBuffer;
  const blob = new Blob([copy], { type: thumb.mimeType });
  return URL.createObjectURL(blob);
}

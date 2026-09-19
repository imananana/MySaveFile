// Parser for The Sims 4 localthumbcache.package — a DBPF container holding
// JPEG thumbnails for households the player has viewed in Manage Households.
//
// All household-portrait entries share resource type 0x3bd45407. Each household
// has multiple entries (one per resolution variant, differentiated by `group`).
// We keep the LARGEST (highest resolution) variant per household id.
import { parseDbpf } from './dbpf';

const HOUSEHOLD_THUMB_TYPE = 0x3bd45407;

export interface HouseholdThumbnail {
  householdId: bigint;
  jpegBytes: Uint8Array;
  size: number;
}

// EA stores household thumbnails as a JPEG with an extra APP0 segment embedded
// after the JFIF header. At byte offset 24 there's an "ALFA" magic, followed by
// a 4-byte big-endian length, then a PNG containing the alpha mask. Browsers
// ignore the unknown segment when decoding the JPEG (so you see the halo'd RGB),
// but if we extract the PNG and use its red channel as alpha, we get the clean
// cutout that Sims 4 Studio exports.
//
// Format documented in the s4pi project (GPL); the implementation below is an
// independent reimplementation using browser canvas APIs.
async function decodeAlphaJpeg(jpegBytes: Uint8Array): Promise<Blob | null> {
  // Locate ALFA magic at offset 24
  if (jpegBytes.length < 32) return null;
  const ALFA = [0x41, 0x4c, 0x46, 0x41];
  if (
    jpegBytes[24] !== ALFA[0] || jpegBytes[25] !== ALFA[1] ||
    jpegBytes[26] !== ALFA[2] || jpegBytes[27] !== ALFA[3]
  ) return null;

  const pngLen =
    (jpegBytes[28] << 24) | (jpegBytes[29] << 16) | (jpegBytes[30] << 8) | jpegBytes[31];
  if (pngLen <= 0 || 32 + pngLen > jpegBytes.length) return null;
  const pngBytes = jpegBytes.slice(32, 32 + pngLen);

  // Decode both the JPEG (browser will skip the unknown APP segment) and the PNG
  const jpegUrl = URL.createObjectURL(new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' }));
  const pngUrl  = URL.createObjectURL(new Blob([new Uint8Array(pngBytes)],  { type: 'image/png'  }));
  try {
    const [jpegImg, pngImg] = await Promise.all([loadImage(jpegUrl), loadImage(pngUrl)]);
    if (jpegImg.naturalWidth !== pngImg.naturalWidth || jpegImg.naturalHeight !== pngImg.naturalHeight) {
      // Dimensions disagree — bail to the raw JPEG. (s4pi throws here; we degrade.)
      return null;
    }
    const w = jpegImg.naturalWidth, h = jpegImg.naturalHeight;

    // Draw JPEG and read RGB
    const c1 = document.createElement('canvas');
    c1.width = w; c1.height = h;
    const cx1 = c1.getContext('2d');
    if (!cx1) return null;
    cx1.drawImage(jpegImg, 0, 0);
    const rgb = cx1.getImageData(0, 0, w, h);

    // Draw PNG and read its red channel as alpha (PNG is grayscale so R=G=B)
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const cx2 = c2.getContext('2d');
    if (!cx2) return null;
    cx2.drawImage(pngImg, 0, 0);
    const alphaSrc = cx2.getImageData(0, 0, w, h);

    // Composite: JPEG RGB + PNG R-channel → alpha
    const out = rgb.data;
    const a = alphaSrc.data;
    for (let i = 0; i < out.length; i += 4) {
      out[i + 3] = a[i]; // R of the alpha PNG → alpha
    }
    cx1.putImageData(rgb, 0, 0);

    // Trim the transparent margins so the stored portrait hugs the figures —
    // the game frames its renders on a big padded canvas, which otherwise makes
    // small households look tiny in any fixed-size cover slot. Crop to the
    // ESSENTIALLY-OPAQUE pixels (the bodies, alpha ≥ 200): the baked drop
    // shadow is semi-transparent but strong enough to beat any low threshold,
    // and including it skews the figures off-center (it streams out one side).
    // Fallback chain (≥200 → >60 → >8) so translucent content — a household of
    // ghosts — still yields a sane box instead of cropping to nothing.
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (const threshold of [199, 60, 8]) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (out[(y * w + x) * 4 + 3] > threshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= 0) break;
    }
    let source = c1;
    if (maxX >= 0 && (minX > 4 || minY > 4 || maxX < w - 5 || maxY < h - 5)) {
      const pad = 8;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
      const cropped = document.createElement('canvas');
      cropped.width = maxX - minX + 1;
      cropped.height = maxY - minY + 1;
      const cctx = cropped.getContext('2d');
      if (cctx) {
        cctx.drawImage(c1, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
        source = cropped;
      }
    }

    return await new Promise<Blob>((resolve, reject) => {
      source.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(jpegUrl);
    URL.revokeObjectURL(pngUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image decode failed'));
    el.src = url;
  });
}

// Public entry: try to produce a clean PNG with proper alpha; if the JPEG
// doesn't carry an ALFA segment we fall back to the original JPEG bytes.
export async function cleanThumbnail(jpegBytes: Uint8Array): Promise<Blob> {
  const cleaned = await decodeAlphaJpeg(jpegBytes);
  if (cleaned) return cleaned;
  return new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' });
}

// Returns map householdId → largest-resolution JPEG bytes found in the cache.
export function parseLocalThumbCache(buffer: ArrayBuffer): Map<bigint, HouseholdThumbnail> {
  const resources = parseDbpf(buffer);
  const best = new Map<bigint, HouseholdThumbnail>();

  for (const r of resources) {
    if (r.type !== HOUSEHOLD_THUMB_TYPE) continue;
    const id = (BigInt(r.instHi) << 32n) | BigInt(r.instLo);
    if (id === 0n) continue;
    // Validate the bytes start with a JPEG magic so we don't ship junk.
    if (r.data.length < 4) continue;
    if (r.data[0] !== 0xff || r.data[1] !== 0xd8 || r.data[2] !== 0xff) continue;

    const existing = best.get(id);
    if (!existing || r.data.length > existing.size) {
      best.set(id, { householdId: id, jpegBytes: r.data, size: r.data.length });
    }
  }
  return best;
}

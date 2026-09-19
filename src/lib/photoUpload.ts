import { toast } from '../store/useToast';

/** Matches the server's ceiling in server/src/routes/photos.ts. */
export const MAX_PHOTO_BYTES = 32 * 1024 * 1024;

/**
 * Every photo upload in the app, failing out loud instead of silently.
 *
 * All eight upload handlers used to share two faults. There was no `catch`
 * between them, so a rejected upload cleared the spinner and said nothing —
 * the server does reject bad files properly, the browser just never mentioned
 * it. And they used `Promise.all`, so a single bad file in a multi-select threw
 * away the good ones alongside it.
 *
 * Screening happens here rather than at the server round-trip because the two
 * predictable rejections — not an image, too big — are both knowable before a
 * single byte leaves the machine, and saying so instantly beats saying so after
 * a 30MB upload.
 */
function tooBig(file: File) {
  return `${file.name} is too large — ${Math.round(file.size / 1024 / 1024)}MB, and the limit is ${MAX_PHOTO_BYTES / 1024 / 1024}MB.`;
}

/**
 * Upload each file independently. Returns whatever succeeded, in order; the
 * failures are reported to the user and logged. Never throws.
 */
export async function uploadPhotos<T>(
  files: File[],
  upload: (file: File) => Promise<T>,
): Promise<T[]> {
  const usable: File[] = [];
  for (const f of files) {
    // `accept="image/*"` is a filter on the OS picker, not a guarantee —
    // "All Files" is one dropdown away, and drag-and-drop bypasses it entirely.
    if (!f.type.startsWith('image/')) toast(`${f.name} isn't an image.`);
    else if (f.size > MAX_PHOTO_BYTES) toast(tooBig(f));
    else usable.push(f);
  }
  if (!usable.length) return [];

  const results = await Promise.allSettled(usable.map(upload));
  const done: T[] = [];
  const reasons: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') done.push(r.value);
    else { reasons.push(serverReason(r.reason)); console.error('[photo upload]', r.reason); }
  }

  const failed = reasons.length;
  if (failed) {
    // When the server said something specific and every failure said the same
    // thing, repeat it — "that file isn't an image the site can read" is far
    // more use than "try again in a moment", which invites a pointless retry.
    const shared = reasons.every((r) => r && r === reasons[0]) ? reasons[0] : '';
    toast(
      failed === usable.length
        ? shared || (usable.length === 1
            ? "That photo didn't upload. Try again in a moment."
            : "Those photos didn't upload. Try again in a moment.")
        // Naming the survivors matters: the page is about to change under you,
        // and "some worked" is the difference between retrying one and all.
        : `${failed} of ${usable.length} photos didn't upload. The rest are in.`,
    );
  }
  return done;
}

/**
 * The server's own words, if it had any worth showing.
 *
 * Its 400s are written for players; its 500s and network failures surface as
 * `HTTP 502` and the like, which is not something to put on screen.
 */
function serverReason(reason: unknown): string {
  const msg = reason instanceof Error ? reason.message : '';
  return /^HTTP \d+$/.test(msg) || !msg ? '' : msg;
}

/** Single-file version — same screening, same reporting. */
export async function uploadPhoto<T>(
  file: File,
  upload: (file: File) => Promise<T>,
): Promise<T | null> {
  const [result] = await uploadPhotos([file], upload);
  return result ?? null;
}

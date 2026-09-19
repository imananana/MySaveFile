/**
 * Opening the OS file dialog at the player's saves folder.
 *
 * ★ SCOPE, decided by the user 2026-08-26: aim the dialog, and nothing else.
 * This deliberately does NOT keep the chosen file to skip the dialog next time.
 * Players use Save As and switch between save files on purpose, so remembering
 * one file would fight how they actually play. Do not add it.
 *
 * ★ SAVE PICKER ONLY. Photo and portrait uploads keep the plain
 * `<input type="file">` they already use. Their dialogs are supposed to open
 * wherever your pictures are.
 *
 * How the aiming actually works, which is not what it looks like:
 *
 * - `startIn: 'documents'` only applies the FIRST time. Every OS puts the saves
 *   folder under Documents, so that is the closest a browser can get unaided —
 *   there is no way to name a path.
 * - `id` is the part that matters. The browser stores the last directory used
 *   per id, so after one pick this dialog reopens in the saves folder for good.
 *   It also isolates that memory from every other dialog in the app, which is
 *   the real fix: the shared "last folder" drifted to wherever you last grabbed
 *   a photo from, and this app uploads a lot of photos.
 *
 * Chrome and Edge only. Firefox and Safari have no File System Access API, so
 * callers fall back to the hidden input, which behaves exactly as it does today.
 * It also needs a secure context, so it is inert on plain http.
 */

export type PickSaveResult =
  | { ok: true; file: File }
  /** The dialog opened and the player closed it. Do nothing. */
  | { ok: false; reason: 'cancelled' }
  /** No API here, or it refused. The caller should open the hidden input. */
  | { ok: false; reason: 'unsupported' };

/** Per-dialog directory memory. Changing this string forgets the folder. */
const SAVE_PICKER_ID = 'mysavefile-sims-save';

type OpenFilePicker = (opts: Record<string, unknown>) => Promise<Array<{ getFile: () => Promise<File> }>>;

/**
 * Must be called synchronously from a click handler — awaiting anything first
 * spends the user activation the dialog needs, and the call then throws.
 */
export async function pickSaveFile(): Promise<PickSaveResult> {
  const showOpenFilePicker = (window as unknown as { showOpenFilePicker?: OpenFilePicker })
    .showOpenFilePicker;

  if (typeof showOpenFilePicker !== 'function') return { ok: false, reason: 'unsupported' };

  try {
    const [handle] = await showOpenFilePicker({
      id: SAVE_PICKER_ID,
      startIn: 'documents',
      multiple: false,
      types: [
        {
          description: 'The Sims 4 save',
          accept: { 'application/octet-stream': ['.save'] },
        },
      ],
      // The "All files" option stays. A player whose save has an odd extension,
      // or who is checking what a file is, should not be blocked by the filter —
      // and the wrong-file handling downstream already names what they picked.
      excludeAcceptAllOption: false,
    });

    if (!handle) return { ok: false, reason: 'cancelled' };
    return { ok: true, file: await handle.getFile() };
  } catch (err) {
    // AbortError is the player closing the dialog, and is not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, reason: 'cancelled' };
    }
    // Anything else — a SecurityError on an insecure origin, a browser that
    // exposes the name but not the behaviour — falls back rather than dead-ends.
    return { ok: false, reason: 'unsupported' };
  }
}

/**
 * The whole flow: try the aimed dialog, fall back to the hidden input, and do
 * nothing at all if the player cancelled. `onFile` runs with the chosen file.
 */
export async function openSaveFilePicker(
  onFile: (file: File) => void,
  fallbackInput: HTMLInputElement | null,
): Promise<void> {
  const result = await pickSaveFile();
  if (result.ok) {
    onFile(result.file);
    return;
  }
  if (result.reason === 'unsupported') fallbackInput?.click();
}

/**
 * Set a sim's portrait. The portrait is a single overlay reference
 * (photo_assignments, target_type 'sim') — one per sim, a new pick replaces it.
 *
 * Where the underlying photo is filed depends on the sim:
 *  - In a household → the picker draws from that household's built photos, and
 *    an upload is added to the household feed too (then doubles as the portrait).
 *  - No household (a deceased / tree-only ancestor) → there's no feed to draw
 *    from, so an upload is filed to the sim itself (target_type 'sim'). It still
 *    becomes the portrait, but never pollutes a household feed or the showcase.
 */
import { useEffect, useRef, useState } from 'react';
import { X, UploadSimple } from '@phosphor-icons/react';
import type { Photo, Sim } from '../../types';
import { api } from '../../lib/api';
import { uploadPhoto } from '../../lib/photoUpload';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { btn, iconBtn } from '../common/btn';

export function SetSimPhotoModal({ saveFileId, sim, onClose, onChanged }: {
  saveFileId: string;
  sim: Sim;
  onClose: () => void;
  onChanged: () => void;
}) {
  useEscapeToClose(onClose);
  const fullName = `${sim.firstName} ${sim.lastName}`.trim() || 'This sim';
  const initials = `${sim.firstName?.[0] ?? ''}${sim.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const [photos, setPhotos] = useState<Photo[]>([]);
  // Current portrait resolved straight from the portrait list (not the
  // household feed) so it still shows for householdless sims, whose portrait
  // photo lives outside any feed.
  const [current, setCurrent] = useState<{ id: string; filename: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [hh, portraits] = await Promise.all([
      sim.householdId ? api.listBuiltPhotos(saveFileId, 'household', sim.householdId) : Promise.resolve([] as Photo[]),
      api.listSimPortraits(saveFileId),
    ]);
    setPhotos(hh);
    const mine = portraits.find((p) => p.simId === sim.id);
    setCurrent(mine ? { id: mine.photoId, filename: mine.filename } : null);
  }
  useEffect(() => { load().catch(() => {}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [saveFileId, sim.id]);

  async function set(photoId: string | null) {
    setBusy(true);
    try { await api.setSimPortrait(saveFileId, sim.id, photoId); await load(); onChanged(); }
    finally { setBusy(false); }
  }

  async function uploadAndSet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('type', 'built');
      fd.append('saveFileId', saveFileId);
      // In a household → file into that household's feed (and double as the
      // portrait). No household → file the photo to the sim itself so the
      // ancestor can still have a portrait, without touching any feed.
      if (sim.householdId) {
        fd.append('targetType', 'household');
        fd.append('targetKey', sim.householdId);
      } else {
        fd.append('targetType', 'sim');
        fd.append('targetKey', sim.id);
      }
      const p = await uploadPhoto(file, (f) => {
        fd.set('photo', f);
        return api.uploadPhoto(fd);
      });
      if (!p) return;
      await api.setSimPortrait(saveFileId, sim.id, p.id);
      await load();
      onChanged();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Was "Dirk Dreamer — photo": an em-dash title (the pattern retired in
            the title pass) plus a text-glyph close. Now it's named for what it
            does, like Choose an icon / Design crest, with the sim as the fact
            line under it. */}
        <div className="px-5 py-4 border-b border-c-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-c-text tracking-headline m-0">Set photo</h2>
            <p className="text-xs text-c-dim mt-0.5 truncate">{fullName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className={iconBtn(8)}>
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-auto bg-c-base">
          <div className="flex items-center gap-4">
            {current ? (
              <img src={api.photoUrl(current.filename, 96)} alt="" className="w-24 h-24 rounded-full object-cover border border-c-border shrink-0" />
            ) : (
              /* Was the words "No photo yet" set inside the circle, which read
                 as a broken image. The app already has an empty-portrait
                 answer — the gender-tinted monogram used in the family tree,
                 households and the create flow — so use that. It looks like a
                 sim, not like a failure. */
              <div
                className="w-24 h-24 rounded-full grid place-items-center text-2xl font-extrabold shrink-0"
                style={sim.isGhost
                  ? { background: '#e0dacd', color: '#8a8170' }
                  : sim.gender === 'male'
                    ? { background: '#ecfdf3', color: '#15803d' }
                    : { background: '#f3eefb', color: '#7c5cbf' }}
              >
                {initials}
              </div>
            )}
            <div className="flex flex-col items-start gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAndSet} />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className={btn('primary')}>
                <UploadSimple size={15} weight="bold" />
                {busy ? 'Uploading…' : 'Upload new'}
              </button>
              {current && (
                <button onClick={() => set(null)} disabled={busy} className={btn('danger', { size: 'sm' })}>
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <div>
            {/* Section label follows the app's uppercase eyebrow, and the two
                empty cases say the one thing that isn't obvious from looking —
                not a paragraph restating what you can already see. */}
            <div className="text-2xs uppercase tracking-label text-c-faint font-bold mb-2">Or pick from household photos</div>
            {!sim.householdId ? (
              <p className="text-[13px] text-c-dim m-0">
                Not in a household, so an upload here stays private to them — it won’t show on your showcase.
              </p>
            ) : photos.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                {photos.map((p) => (
                  <button key={p.id} onClick={() => set(p.id)} disabled={busy}
                    className={`aspect-square rounded-lg overflow-hidden border-2 disabled:opacity-50 ${p.id === current?.id ? 'border-c-accent' : 'border-c-border hover:border-c-accent'}`}>
                    <img src={api.photoUrl(p.filename, 96)} alt={p.caption} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-c-dim m-0">Nothing in this household’s feed yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

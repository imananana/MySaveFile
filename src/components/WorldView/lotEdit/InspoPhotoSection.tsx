import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, UploadSimple, X, MapPin, Check } from '@phosphor-icons/react';
import type { Photo } from '../../../types';
import { api } from '../../../lib/api';
import { uploadPhotos } from '../../../lib/photoUpload';
import { useSaveFile } from '../../../store/useSaveFile';
import { btn, iconBtn } from '../../common/btn';

/**
 * Inspiration-photo section of the lot edit modal. Pulls from the per-save
 * inspo pool. Lets you assign existing photos, upload new ones (assigned on
 * upload), or unassign.
 */
export function InspoPhotoSection({ saveFileId, lotKey, onAssigned }: { saveFileId: string; lotKey: string; onAssigned?: () => void }) {
  const navigate = useNavigate();
  const worldName = useSaveFile((s) => s.lots[lotKey]?.worldName);
  const [allInspo, setAllInspo] = useState<Photo[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(() => {
    api.listInspoPhotos(saveFileId).then(setAllInspo);
  }, [saveFileId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const assigned = allInspo.filter(
    (p) => p.assignment?.target_type === 'lot' && p.assignment?.target_key === lotKey
  );
  // Inspo pinned to this lot's world — offered at the top of the picker so you can
  // pull a world mood-board shot onto a specific lot. Picking re-assigns it to the
  // lot; it still appears on the world's inspo (that view aggregates its lots).
  const worldInspo = worldName
    ? allInspo.filter((p) => p.assignment?.target_type === 'world' && p.assignment?.target_key === worldName && !p.excluded)
    : [];
  // Truly unassigned photos (no current assignment).
  const poolPhotos = allInspo.filter((p) => !p.assignment && !p.excluded);

  const filteredWorldInspo = worldInspo;
  const filteredPool = poolPhotos;

  const renderTile = (p: Photo, fromWorld: boolean) => {
    const isSel = selected.has(p.id);
    return (
      <div key={p.id} className="relative group aspect-square">
        <button onClick={() => toggleSelect(p.id)}
          className={`w-full h-full rounded-lg overflow-hidden border-2 cursor-pointer bg-transparent p-0 transition-colors ${isSel ? 'border-c-accent' : 'border-transparent hover:border-c-accent-border'}`}>
          <img src={api.photoUrl(p.filename, 200)} alt={p.caption} className="w-full h-full object-cover" />
        </button>
        {isSel && (
          <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-c-accent text-white flex items-center justify-center shadow pointer-events-none">
            <Check size={12} weight="bold" />
          </span>
        )}
        {fromWorld && (
          <span className="absolute top-1 right-1 text-[8px] px-1 py-px rounded bg-c-secondary text-white font-bold uppercase tracking-label pointer-events-none">World</span>
        )}
      </div>
    );
  };

  function toggleSelect(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function openPicker() {
    setSelected(new Set());
    setShowPicker(true);
  }
  function closePicker() {
    setSelected(new Set());
    setShowPicker(false);
  }

  async function handleAddSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => api.assignPhoto(id, saveFileId, 'lot', lotKey)));
    loadPhotos();
    onAssigned?.();
    closePicker();
  }

  async function handleUnassign(photoId: string) {
    await api.unassignPhoto(photoId, saveFileId);
    loadPhotos();
  }

  async function handleUploadAndAssign(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';
    setUploading(true);
    try {
      await uploadPhotos(files, async (file) => {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('type', 'inspo');
        const p = await api.uploadPhoto(fd);
        await api.assignPhoto(p.id, saveFileId, 'lot', lotKey);
      });
      loadPhotos();
      onAssigned?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {/* Pin Pick/Upload to the left so they stay reachable as the strip scrolls */}
        <div className="flex gap-2 sticky left-0 z-10 shrink-0 bg-c-card">
          <button onClick={openPicker}
            aria-label="Pick from inspo pool"
            className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-c-border flex flex-col items-center justify-center gap-1 cursor-pointer bg-transparent hover:border-c-accent hover:bg-c-accent-soft transition-all text-c-dim hover:text-c-accent">
            <Stack size={18} weight="bold" />
            <span className="text-2xs font-medium">Pick</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            aria-label="Upload new inspo photos"
            className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-c-border flex flex-col items-center justify-center gap-1 cursor-pointer bg-transparent hover:border-c-accent hover:bg-c-accent-soft transition-all text-c-dim hover:text-c-accent disabled:opacity-50">
            <UploadSimple size={18} weight="bold" />
            <span className="text-2xs font-medium">{uploading ? 'Saving' : 'Upload'}</span>
          </button>
        </div>
        {assigned.map((p) => (
          <div key={p.id} className="relative group shrink-0">
            <img src={api.photoUrl(p.filename, 80)} alt={p.caption}
              className="w-20 h-20 rounded-lg object-cover border border-c-border" />
            <button onClick={() => handleUnassign(p.id)}
              aria-label="Unassign photo"
              className="absolute -top-1 -right-1 w-4 h-4 bg-c-card border border-c-border rounded-full text-[9px] text-c-red flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
              ✕
            </button>
          </div>
        ))}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadAndAssign} />
      </div>

      {showPicker && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={closePicker}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-c-border shrink-0">
              <h3 className="text-sm font-semibold text-c-text">Pick inspo photos</h3>
              <button onClick={closePicker} aria-label="Close" className={iconBtn(7)}><X size={16} weight="bold" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {filteredWorldInspo.length === 0 && filteredPool.length === 0 && (
                <p className="text-xs text-c-faint text-center mt-4">
                  {worldInspo.length === 0 && poolPhotos.length === 0 ? (
                    <>
                      No unassigned inspo photos.{' '}
                      <button
                        type="button"
                        onClick={() => { setShowPicker(false); navigate(`/saves/${saveFileId}/photos`); }}
                        className="text-c-accent hover:underline bg-transparent border-none cursor-pointer p-0 text-xs"
                      >
                        Open the Inspo page
                      </button>
                      {' '}to upload some.
                    </>
                  ) : 'No photos match the selected filters.'}
                </p>
              )}

              {filteredWorldInspo.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5 text-2xs font-semibold uppercase tracking-label text-c-secondary">
                    <MapPin size={11} weight="fill" />
                    From {worldName}
                    <span className="normal-case tracking-normal text-c-faint font-normal">· moves to this lot</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {filteredWorldInspo.map((p) => renderTile(p, true))}
                  </div>
                </div>
              )}

              {filteredPool.length > 0 && (
                <div>
                  {filteredWorldInspo.length > 0 && (
                    <div className="text-2xs font-semibold uppercase tracking-label text-c-dim mb-1.5">Unassigned pool</div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    {filteredPool.map((p) => renderTile(p, false))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-c-border shrink-0">
              <span className="text-xs text-c-dim">{selected.size} selected</span>
              <button
                onClick={handleAddSelected}
                disabled={selected.size === 0}
                className={btn('primary', { size: 'sm' })}
              >
                {selected.size > 0 ? `Add ${selected.size} photo${selected.size === 1 ? '' : 's'}` : 'Add photos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

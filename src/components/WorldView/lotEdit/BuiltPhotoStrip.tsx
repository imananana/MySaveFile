import { useState, useEffect, useRef } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import type { Photo } from '../../../types';
import { api } from '../../../lib/api';
import { uploadPhotos } from '../../../lib/photoUpload';
import { useConfirm } from '../../common/ConfirmDialog';
import { AtInput } from '../../common/AtInput';
import { btn } from '../../common/btn';

/**
 * Horizontal strip of "built" photos for a single lot, with upload + edit +
 * delete affordances. "Built" photos are the showcase shots a user attaches
 * after finishing a build, distinct from inspiration photos (which live in a
 * separate per-save pool).
 */
export function BuiltPhotoStrip({
  saveFileId,
  lotKey,
  onPhotoChange,
}: {
  saveFileId: string;
  lotKey: string;
  onPhotoChange?: (count: number) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preview, setPreview] = useState<Photo | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editGalleryCreator, setEditGalleryCreator] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadGalleryCreator, setUploadGalleryCreator] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    api.listBuiltPhotos(saveFileId, 'lot', lotKey).then(setPhotos);
  }, [saveFileId, lotKey]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setPendingFiles(files);
    setUploadCaption('');
    setUploadGalleryCreator('');
  }

  async function handleConfirmUpload() {
    if (!pendingFiles.length) return;
    setUploading(true);
    const gc = uploadGalleryCreator.trim();
    const cap = uploadCaption.trim();
    try {
      const uploaded = await uploadPhotos(pendingFiles, (file) => {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('type', 'built');
        fd.append('saveFileId', saveFileId);
        fd.append('targetType', 'lot');
        fd.append('targetKey', lotKey);
        if (cap) fd.append('caption', cap);
        if (gc) fd.append('galleryCreator', gc);
        return api.uploadPhoto(fd);
      });
      const next = [...photos, ...uploaded];
      setPhotos(next);
      onPhotoChange?.(next.length);
      setPendingFiles([]);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveCaption() {
    if (!preview) return;
    await api.updatePhotoCaption(preview.id, editCaption);
    setPhotos((prev) => prev.map((p) => p.id === preview.id ? { ...p, caption: editCaption } : p));
    setPreview((p) => p ? { ...p, caption: editCaption } : p);
  }

  async function handleSaveGalleryCreator() {
    if (!preview) return;
    const val = editGalleryCreator.trim() || null;
    await api.updatePhotoMeta(preview.id, { galleryCreator: val });
    setPhotos((prev) => prev.map((p) => p.id === preview.id ? { ...p, gallery_creator: val } : p));
    setPreview((p) => p ? { ...p, gallery_creator: val } : p);
  }

  async function handleDelete() {
    if (!preview) return;
    if (!await confirm({ message: 'Delete this photo?', confirmLabel: 'Delete', danger: true })) return;
    await api.deletePhoto(preview.id);
    const next = photos.filter((p) => p.id !== preview.id);
    setPhotos(next);
    setPreview(null);
    onPhotoChange?.(next.length);
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {/* Pin Upload to the left so it stays reachable as the strip scrolls */}
        <div className="sticky left-0 z-10 shrink-0 bg-c-card">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            aria-label="Upload showcase photo"
            className="w-20 h-20 rounded-lg border-2 border-dashed border-c-border flex flex-col items-center justify-center gap-1 cursor-pointer bg-transparent hover:border-c-accent hover:bg-c-accent-soft transition-all text-c-dim hover:text-c-accent disabled:opacity-50">
            <UploadSimple size={18} weight="bold" />
            <span className="text-2xs font-medium">{uploading ? 'Saving' : 'Upload'}</span>
          </button>
        </div>
        {photos.map((p) => (
          <button key={p.id} onClick={() => { setPreview(p); setEditCaption(p.caption); setEditGalleryCreator(p.gallery_creator ?? ''); }}
            className="shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-transparent hover:border-c-accent transition-all cursor-pointer bg-transparent p-0">
            <img src={api.photoUrl(p.filename, 80)} alt={p.caption} className="w-full h-full object-cover" />
          </button>
        ))}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Upload metadata modal */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-[250] flex items-center justify-center p-4" onClick={() => setPendingFiles([])}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-c-text">
              {pendingFiles.length === 1 ? 'Add photo details' : `Add details (${pendingFiles.length} photos)`}
            </p>
            <input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="w-full border border-c-border rounded-lg px-3 py-2 text-sm text-c-text bg-c-base focus:outline-none focus:border-c-accent placeholder:text-c-faint" />
            <div>
              <p className="text-xs text-c-dim mb-1">Gallery creator</p>
              <AtInput value={uploadGalleryCreator} onChange={setUploadGalleryCreator} placeholder="username" />
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setPendingFiles([])} className="flex-1 border border-c-border rounded-lg py-2 text-xs text-c-dim bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleConfirmUpload} disabled={uploading}
                className={btn('primary', { size: 'sm', className: 'flex-1' })}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-[250] flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img src={api.photoUrl(preview.filename, 384)} alt="" className="w-full aspect-video object-cover" />
            <div className="p-4 flex flex-col gap-3">
              <input value={editCaption} onChange={(e) => setEditCaption(e.target.value)}
                onBlur={handleSaveCaption} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Caption…" className="w-full border border-c-border rounded-lg px-3 py-2 text-sm text-c-text bg-c-base focus:outline-none focus:border-c-accent" />
              <div>
                <p className="text-xs text-c-dim mb-1">Gallery creator</p>
                <AtInput value={editGalleryCreator} onChange={setEditGalleryCreator} placeholder="username" className="w-full" />
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => { handleSaveGalleryCreator(); setPreview(null); }} className="flex-1 border border-c-border rounded-lg py-2 text-xs text-c-dim bg-transparent cursor-pointer">Close</button>
                <button onClick={handleDelete} className={btn('danger', { size: 'sm', className: 'flex-1' })}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

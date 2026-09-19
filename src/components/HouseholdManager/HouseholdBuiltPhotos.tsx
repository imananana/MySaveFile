import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Camera, UploadSimple } from '@phosphor-icons/react';
import { useSaveFile } from '../../store/useSaveFile';
import type { Photo } from '../../types';
import { api } from '../../lib/api';
import { uploadPhotos } from '../../lib/photoUpload';
import { useConfirm } from '../common/ConfirmDialog';
import { Pill } from '../common/Pill';
import { btn } from '../common/btn';

export function HouseholdBuiltPhotos({
  householdId, photos, onAdded, onDeleted, onCaptionSaved, onSyncPhotos,
}: {
  householdId: string;
  photos: Photo[];
  onAdded: (photo: Photo) => void;
  onDeleted: (id: string) => void;
  onCaptionSaved: (id: string, caption: string) => void;
  onSyncPhotos?: () => void;
}) {
  const [preview, setPreview] = useState<Photo | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editGalleryCreator, setEditGalleryCreator] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadGalleryCreator, setUploadGalleryCreator] = useState('');
  const [uploading, setUploading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const saveFileId = useSaveFile((s) => s.saveFileId)!;

  useEffect(() => {
    if (preview) {
      const updated = photos.find((p) => p.id === preview.id);
      if (!updated) setPreview(null);
    }
  }, [photos, preview]);

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
      // Was a sequential for-loop with no catch: the FIRST bad file aborted
      // every photo queued behind it, silently.
      const uploaded = await uploadPhotos(pendingFiles, (file) => {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('type', 'built');
        fd.append('saveFileId', saveFileId);
        fd.append('targetType', 'household');
        fd.append('targetKey', householdId);
        if (cap) fd.append('caption', cap);
        if (gc) fd.append('galleryCreator', gc);
        return api.uploadPhoto(fd);
      });
      uploaded.forEach(onAdded);
      setPendingFiles([]);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveCaption() {
    if (!preview) return;
    await api.updatePhotoCaption(preview.id, editCaption);
    onCaptionSaved(preview.id, editCaption);
    setPreview((p) => p ? { ...p, caption: editCaption } : p);
  }

  async function handleSaveGalleryCreator() {
    if (!preview) return;
    const val = editGalleryCreator.trim() || null;
    await api.updatePhotoMeta(preview.id, { galleryCreator: val });
    setPreview((p) => p ? { ...p, gallery_creator: val } : p);
  }

  async function handleDelete() {
    if (!preview) return;
    if (!await confirm({ message: 'Delete this photo?', confirmLabel: 'Delete', danger: true })) return;
    await api.deletePhoto(preview.id);
    onDeleted(preview.id);
    setPreview(null);
  }

  return (
    <div>
      {/* Header matches the panels' quiet section labels — no inline divider
          (the section separator above it already draws the line), caret only. */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={`w-full flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 group ${collapsed ? '' : 'mb-3'}`}
      >
        <span className="text-2xs font-bold text-c-secondary uppercase tracking-label transition-colors">
          Showcase Photos
        </span>
        {photos.length > 0 && (
          <Pill tone="purple" tabular>
            {photos.length}
          </Pill>
        )}
        <div className="flex-1" />
        <CaretDown
          size={12}
          weight="bold"
          className={`text-c-secondary transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>
      {!collapsed && (
        <div className="flex flex-wrap gap-3">
          {/* Pin the two entry points first (Upload per household, Sync whole-save)
              so they stay reachable when a household has many photos. */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-32 h-32 rounded-xl border-2 border-dashed border-c-border flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-transparent hover:border-c-accent hover:bg-c-accent-soft transition-all text-c-dim hover:text-c-accent text-xs font-medium disabled:opacity-50 shrink-0"
          >
            <UploadSimple size={22} weight="bold" />
            {uploading ? 'Uploading' : 'Upload'}
          </button>
          {onSyncPhotos && (
            <button
              onClick={onSyncPhotos}
              className="w-32 h-32 rounded-xl border-2 border-dashed border-c-border flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-transparent hover:border-c-accent hover:bg-c-accent-soft transition-all text-c-dim hover:text-c-accent text-xs font-medium shrink-0"
            >
              <Camera size={22} weight="bold" />
              Sync from save
            </button>
          )}
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => { setPreview(p); setEditCaption(p.caption); setEditGalleryCreator(p.gallery_creator ?? ''); }}
              className="w-32 h-32 rounded-xl overflow-hidden border-2 border-transparent hover:border-c-accent transition-all cursor-pointer bg-transparent p-0 shrink-0"
            >
              <img src={api.photoUrl(p.filename, 128)} alt={p.caption} className="w-full h-full object-cover" />
            </button>
          ))}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>
      )}

      {/* Upload metadata modal — portaled to body so the scrim covers the whole
          viewport (the workspace aside has a transform that would otherwise
          scope this fixed overlay to that box). */}
      {pendingFiles.length > 0 && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[350] flex items-center justify-center p-4" onClick={() => setPendingFiles([])}>
          <div className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-c-text">Add photo details</p>
            <input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)}
              placeholder="Caption (optional)"
              className="w-full border border-c-border rounded-lg px-3 py-2 text-sm text-c-text bg-c-base focus:outline-none focus:border-c-accent placeholder:text-c-faint" />
            <div>
              <p className="text-xs text-c-dim mb-1">Gallery creator</p>
              <div className="flex items-center border border-c-border rounded-lg overflow-hidden focus-within:border-c-accent bg-c-base">
                <span className="px-2 text-sm text-c-dim select-none">@</span>
                <input value={uploadGalleryCreator} onChange={(e) => setUploadGalleryCreator(e.target.value)}
                  placeholder="username"
                  className="flex-1 py-2 pr-3 text-sm text-c-text bg-transparent focus:outline-none placeholder:text-c-faint" />
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setPendingFiles([])} className="flex-1 border border-c-border rounded-lg py-2 text-xs text-c-dim bg-transparent cursor-pointer">Cancel</button>
              <button onClick={handleConfirmUpload} disabled={uploading}
                className={btn('primary', { size: 'sm', className: 'flex-1' })}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit preview modal — portaled to body (same scrim-scoping fix). */}
      {preview && createPortal(
        <div className="fixed inset-0 bg-black/70 z-[350] flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <img src={api.photoUrl(preview.filename, 768)} alt="" className="w-full max-h-[75vh] object-contain bg-c-panel" />
            <div className="p-4 flex flex-col gap-3">
              <input
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                onBlur={handleSaveCaption}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Caption…"
                className="w-full border border-c-border rounded-lg px-3 py-2 text-sm text-c-text bg-c-base focus:outline-none focus:border-c-accent"
              />
              <div>
                <p className="text-xs text-c-dim mb-1">Gallery creator</p>
                <div className="flex items-center border border-c-border rounded-lg overflow-hidden focus-within:border-c-accent bg-c-base">
                  <span className="px-2 text-sm text-c-dim select-none">@</span>
                  <input value={editGalleryCreator} onChange={(e) => setEditGalleryCreator(e.target.value)}
                    onBlur={handleSaveGalleryCreator}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder="username"
                    className="flex-1 py-2 pr-3 text-sm text-c-text bg-transparent focus:outline-none placeholder:text-c-faint" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { handleSaveGalleryCreator(); setPreview(null); }} className="flex-1 border border-c-border rounded-lg py-2 text-xs text-c-dim bg-transparent cursor-pointer">Close</button>
                <button onClick={handleDelete} className={btn('danger', { size: 'sm', className: 'flex-1' })}>Delete</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
